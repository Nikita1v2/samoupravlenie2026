# импорт библиотек
import os
import time
from threading import Lock
from flask import Flask, request, jsonify
from flask_sqlalchemy import SQLAlchemy
from flask_cors import CORS
from sqlalchemy import and_
from itsdangerous import URLSafeTimedSerializer, BadSignature
from datetime import datetime, timedelta
from werkzeug.middleware.proxy_fix import ProxyFix
from werkzeug.security import check_password_hash, generate_password_hash

app = Flask(__name__)
app.wsgi_app = ProxyFix(
    app.wsgi_app,
    x_for=1,
    x_proto=1,
    x_host=1,
    x_port=1,
    x_prefix=1
)

# другие адреса
CORS(app, origins=[
    'https://samoupravlenie2026.ru',
    'https://www.samoupravlenie2026.ru',
    'https://samoupravlenie2026.online',
    'https://www.samoupravlenie2026.online',
])

# админы
ADMIN_NAMES = {
    'Соколов Евгений Сергеевич',
    'Зуев Кирилл Алексеевич',
    'Самков Александр Александрович',
    'Новокрещенных Тимофей Дмитриевич',
    'Добровольский Никита Иванович',
    'Левина Елизавета Сергеевна',
}

# бд
DATABASE_PATH = os.environ.get('DATABASE_PATH', '/home/apple/web_server/data/students.db')
app.config['SQLALCHEMY_DATABASE_URI'] = f'sqlite:///{DATABASE_PATH}'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

db = SQLAlchemy(app)

# для токенов
_secret = os.environ.get('SECRET_KEY')
if not _secret:
    print('ВНИМАНИЕ: SECRET_KEY не задан в переменных окружения, используется ключ из кода. Задайте SECRET_KEY на сервере!')
    _secret = 'AmveraChangeThisSecretKey_9f3c7b2e6a1d4f8c'
app.secret_key = _secret

# создатель токенов
serializer = URLSafeTimedSerializer(app.secret_key)

# макет таблицы учеников
class Student(db.Model):
    __tablename__ = 'students'
    id = db.Column('rowid', db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    student_class = db.Column('class', db.String(2), nullable=False)
    group = db.Column(db.String(5), nullable=False)
    coins = db.Column(db.Integer, default=0)
    buying = db.Column(db.String(255), default='')
    password = db.Column(db.String(255), default='')
    status = db.Column(db.String(255), default='ученик')

# макет таблицы логов renocoins
class CoinLog(db.Model):
    __tablename__ = 'coin_logs'
    id = db.Column(db.Integer, primary_key=True)
    giver_name = db.Column(db.String(100), nullable=False)
    receiver_name = db.Column(db.String(100), nullable=False)
    receiver_class = db.Column(db.String(2), nullable=False)
    receiver_group = db.Column(db.String(5), nullable=False)
    amount = db.Column(db.Integer, nullable=False)
    action = db.Column(db.String(20), nullable=False)
    reason = db.Column(db.String(255), nullable=False)
    timestamp = db.Column(db.DateTime, default=datetime.utcnow)

# макет таблицы жалоб
class Complaint(db.Model):
    __tablename__ = 'complaints'
    id = db.Column(db.Integer, primary_key=True)
    complainant_name = db.Column(db.String(100), nullable=False)
    complainant_class = db.Column(db.String(2), nullable=False)
    complainant_group = db.Column(db.String(5), nullable=False)
    dubler_name = db.Column(db.String(100), nullable=False)
    dubler_class = db.Column(db.String(2), nullable=False)
    dubler_group = db.Column(db.String(5), nullable=False)
    reason = db.Column(db.String(255), nullable=False)
    timestamp = db.Column(db.DateTime, default=datetime.utcnow)

# таблица покупок магазина
class Purchase(db.Model):
    __tablename__ = 'purchases'
    id = db.Column(db.Integer, primary_key=True)
    buyer_name = db.Column(db.String(100), nullable=False)
    product_name = db.Column(db.String(255), nullable=False)
    price = db.Column(db.Integer, nullable=False)
    timestamp = db.Column(db.DateTime, default=datetime.utcnow)

# стартовый соцрейтинг дублёра
START_RATING = 100

# соцрейтинг дублёров 
class DublerRating(db.Model):
    __tablename__ = 'dubler_ratings'
    id = db.Column(db.Integer, primary_key=True)
    dubler_name = db.Column(db.String(100), nullable=False, unique=True)
    rating = db.Column(db.Integer, nullable=False, default=START_RATING)

# история изменений соцрейтинга
class RatingLog(db.Model):
    __tablename__ = 'rating_logs'
    id = db.Column(db.Integer, primary_key=True)
    dubler_name = db.Column(db.String(100), nullable=False)
    admin_name = db.Column(db.String(100), nullable=False)
    delta = db.Column(db.Integer, nullable=False)
    reason = db.Column(db.String(255), nullable=False)
    timestamp = db.Column(db.DateTime, default=datetime.utcnow)

# создаем недостающие таблицы.
if __name__ == '__main__':
    with app.app_context():
        db.create_all()
    app.run()


# возвращает ученика-админа по токену
def get_admin(token):
    if not token:
        return None
    try:
        name = serializer.loads(token, max_age=86400)
    except BadSignature:
        return None
    if name not in ADMIN_NAMES:
        return None
    student = Student.query.filter_by(name=name).first()
    if not student or not student.password:
        return None
    return student

# защита входа от перебора паролей
LOGIN_COOLDOWN = 3      # секунд паузы после неверного пароля
LOGIN_MAX_FAILS = 5     # столько ошибок подряд, и блокировка на дольше
LOGIN_LOCK_TIME = 60    # секунд длинной блокировки
LOGIN_FAILS = {}        # ключ 'ip|имя'
LOGIN_LOCK = Lock()

# сколько секунд ещё ждать
def login_wait_time(key):
    with LOGIN_LOCK:
        info = LOGIN_FAILS.get(key)
        if info and info['until'] > time.time():
            return int(info['until'] - time.time()) + 1
    return 0

def register_login_fail(key):
    with LOGIN_LOCK:
        now = time.time()
        if len(LOGIN_FAILS) > 10000:  # чистим старое, чтобы словарь не рос бесконечно
            for k in [k for k, v in LOGIN_FAILS.items() if v['until'] < now]:
                del LOGIN_FAILS[k]
        info = LOGIN_FAILS.get(key, {'count': 0, 'until': 0})
        info['count'] += 1
        if info['count'] >= LOGIN_MAX_FAILS:
            info['until'] = now + LOGIN_LOCK_TIME
            info['count'] = 0
        else:
            info['until'] = now + LOGIN_COOLDOWN
        LOGIN_FAILS[key] = info

def clear_login_fails(key):
    with LOGIN_LOCK:
        LOGIN_FAILS.pop(key, None)

# рейтинг дублёра для записи (создаёт строку, если её ещё нет)
def get_rating_row(name):
    row = DublerRating.query.filter_by(dubler_name=name).first()
    if not row:
        row = DublerRating(dubler_name=name, rating=START_RATING)
        db.session.add(row)
        db.session.flush()
    return row

# ВХОД И ПРОФИЛЬ

# подгрузка имен для входа
@app.route('/api/get_registered_students', methods=['GET'])
def get_registered_students():
    class_param = request.args.get('class')
    group_param = request.args.get('group')
    if not class_param or not group_param:
        return jsonify([]), 400
    try:
        registered_students = Student.query.filter_by(
            student_class=class_param,
            group=group_param,
            status='ученик'
        ).filter(
            and_(Student.password != '', Student.password != None)
        ).all()
        return jsonify([student.name for student in registered_students])
    except Exception as e:
        return jsonify({'error': str(e)}), 500

# подгрузка имен для входа дублеров
@app.route('/api/get_registered_dublers', methods=['GET'])
def get_registered_dublers():
    class_param = request.args.get('class')
    group_param = request.args.get('group')
    if not class_param or not group_param:
        return jsonify([]), 400
    try:
        registered_dublers = Student.query.filter_by(
            student_class=class_param,
            group=group_param,
            status='дублёр'
        ).filter(
            and_(Student.password != '', Student.password != None)
        ).all()
        return jsonify([student.name for student in registered_dublers])
    except Exception as e:
        return jsonify({'error': str(e)}), 500

# подгрузка всех дублеров школы для жалобы
@app.route('/api/get_all_dublers', methods=['GET'])
def get_all_dublers():
    try:
        all_dublers = Student.query.filter_by(
            status='дублёр'
        ).filter(
            and_(Student.password != '', Student.password != None)
        ).all()
        return jsonify([
            {
                'name': d.name,
                'class': d.student_class,
                'group': d.group
            }
            for d in all_dublers
        ])
    except Exception as e:
        return jsonify({'error': str(e)}), 500

# проверка пароля при входе
@app.route('/api/login', methods=['POST'])
def login_user():
    data = request.get_json(silent=True) or {}
    name = data.get('name')
    class_val = data.get('class')
    group_val = data.get('group')
    password = data.get('password')
    if not all([name, class_val, group_val, password]):
        return jsonify({'error': 'Все поля обязательны для заполнения'}), 400
    # ключ
    key = f'{request.remote_addr}|{name}'
    wait = login_wait_time(key)
    if wait > 0:
        return jsonify({
            'error': f'Слишком частые попытки. Подождите {wait} сек.',
            'retry_after': wait
        }), 429
    try:
        student = Student.query.filter_by(
            name=name,
            student_class=class_val,
            group=group_val
        ).first()
# сравниваем введённый пароль с хешем из базы
        if not check_password_hash(student.password, password):
            register_login_fail(key)
            return jsonify({
                'error': 'Вы ввели неверный пароль',
                'retry_after': max(login_wait_time(key), LOGIN_COOLDOWN)
            }), 400
        clear_login_fails(key)
        token = serializer.dumps(student.name)
        return jsonify({
            'success': True,
            'message': 'Вход выполнен успешно!',
            'token': token
        }), 200
    except Exception:
        return jsonify({'error': 'Ошибка при входе в БД'}), 500

# проверка сессии по токену
@app.route('/api/verify_user', methods=['GET'])
def verify_user():
    token = request.args.get('token')
    if not token:
        return jsonify({
            'exists': False,
            'error': 'Токен отсутствует'
        }), 400
    try:
        decrypted_name = serializer.loads(token, max_age=86400)
        student = Student.query.filter_by(name=decrypted_name).first()
        if student and student.password:
            rating = None
            if student.status == 'дублёр':
                r = DublerRating.query.filter_by(dubler_name=student.name).first()
                rating = r.rating if r else START_RATING
            return jsonify({
                'exists': True,
                'name': student.name,
                'status': student.status,
                'group': student.group,
                'coins': student.coins,
                'rating': rating,
                'is_admin': student.name in ADMIN_NAMES
            }), 200
        return jsonify({'exists': False}), 200
    except Exception:
        return jsonify({
            'exists': False,
            'error': 'Недействительный токен'
        }), 200

# сохранение жалобы на дублера
@app.route('/api/submit_complaint', methods=['POST'])
def submit_complaint():
    data = request.get_json()
    token = data.get('token')
    dubler_name = data.get('dubler_name')
    dubler_class = data.get('dubler_class')
    dubler_group = data.get('dubler_group')
    reason = data.get('reason')
    if not all([
        token,
        dubler_name,
        dubler_class,
        dubler_group,
        reason
    ]):
        return jsonify({
            'error': 'Все поля обязательны для заполнения'
        }), 400
    try:
        complainant_name = serializer.loads(token, max_age=86400)
        complainant = Student.query.filter_by(
            name=complainant_name
        ).first()
        one_hour_ago = datetime.utcnow() - timedelta(hours=1)
        recent_complaint = Complaint.query.filter_by(
            complainant_name=complainant.name,
            dubler_name=dubler_name
        ).filter(
            Complaint.timestamp >= one_hour_ago
        ).first()
        if recent_complaint:
            return jsonify({
                'error': 'Вы уже жаловались на этого дублёра недавно, попробуйте через час'
            }), 400
        new_complaint = Complaint(
            complainant_name=complainant.name,
            complainant_class=complainant.student_class,
            complainant_group=complainant.group,
            dubler_name=dubler_name,
            dubler_class=dubler_class,
            dubler_group=dubler_group,
            reason=reason
        )
        db.session.add(new_complaint)
        db.session.commit()
        return jsonify({
            'success': True,
            'message': 'Жалоба отправлена!'
        }), 200
    except Exception:
        db.session.rollback()
        return jsonify({
            'error': 'Ошибка при отправке жалобы'
        }), 500

# RENOCOINS

# списание renocoins дублером
@app.route('/api/coins', methods=['POST'])
def update_coins():
    data = request.get_json(silent=True) or {}
    token = data.get('token')
    name = data.get('name')
    class_val = data.get('class')
    group_val = data.get('group')
    amount = data.get('amount')
    reason = data.get('reason')
    action = data.get('action')
    if not all([
        token,
        name,
        class_val,
        group_val,
        amount,
        reason,
        action
    ]):
        return jsonify({
            'error': 'Все поля обязательны для заполнения'
        }), 400
# начислять можно только за дела, вручную только списывать
    try:
        giver_name = serializer.loads(token, max_age=86400)
        giver = Student.query.filter_by(
            name=giver_name,
            status='дублёр'
        ).first()
        student = Student.query.filter_by(
            name=name,
            student_class=class_val,
            group=group_val
        ).first()
        try:
            amount_val = int(amount)
        except (TypeError, ValueError):
            return jsonify({
                'error': 'Количество renocoins должно быть целым числом'
            }), 400
# отрицательное или нулевое количество запрещено
        if amount_val <= 0:
            return jsonify({
                'error': 'Количество renocoins должно быть больше нуля'
            }), 400
        student.coins -= amount_val
        new_log = CoinLog(
            giver_name=giver.name,
            receiver_name=student.name,
            receiver_class=student.student_class,
            receiver_group=student.group,
            amount=amount_val,
            action=action,
            reason=reason
        )
        db.session.add(new_log)
        db.session.commit()
        return jsonify({
            'success': True,
            'message': 'Renocoins успешно изменены!'
        }), 200
    except BadSignature:
        return jsonify({'error': 'Сессия устарела. Войдите заново.'}), 401
    except Exception:
        db.session.rollback()
        return jsonify({
            'error': 'Ошибка при изменении renocoins'
        }), 500

# ДЕЛА

def _places(group, key, values):
    '''Четыре строки: 1, 2, 3 место и участие.'''
    parts = [('1', '1 место'), ('2', '2 место'), ('3', '3 место'), ('part', 'Участие')]
    return [
        {'id': f'{key}_{pid}', 'group': group, 'name': f'{group}: {label}', 'coins': v}
        for (pid, label), v in zip(parts, values)
    ]
DEEDS = []
DEEDS += _places('Клэш Рояль (5–6 классы)', 'clash_royale_56', (300, 200, 140, 50))
DEEDS += _places('Угадай песню (5–6 классы)', 'guess_song_56', (250, 150, 100, 40))
DEEDS += _places('Мардэр Мистери (7–11 классы)', 'murder_mystery_711', (300, 200, 140, 50))
DEEDS += _places('Теннис (7–11 классы)', 'tennis_711', (300, 200, 140, 50))
COURT_GROUP = 'Суд (7–11 классы)'
DEEDS += [
    {'id': 'court_prosecutor_win', 'group': COURT_GROUP, 'name': 'Суд: Прокурор — победа стороны', 'coins': 300},
    {'id': 'court_prosecutor_lose', 'group': COURT_GROUP, 'name': 'Суд: Прокурор — поражение стороны', 'coins': 150},
    {'id': 'court_lawyer_win', 'group': COURT_GROUP, 'name': 'Суд: Адвокат — победа стороны', 'coins': 300},
    {'id': 'court_lawyer_lose', 'group': COURT_GROUP, 'name': 'Суд: Адвокат — поражение стороны', 'coins': 150},
    {'id': 'court_victim_win', 'group': COURT_GROUP, 'name': 'Суд: Потерпевший — победа стороны', 'coins': 160},
    {'id': 'court_victim_lose', 'group': COURT_GROUP, 'name': 'Суд: Потерпевший — поражение стороны', 'coins': 80},
    {'id': 'court_suspect_win', 'group': COURT_GROUP, 'name': 'Суд: Подозреваемый — победа стороны', 'coins': 160},
    {'id': 'court_suspect_lose', 'group': COURT_GROUP, 'name': 'Суд: Подозреваемый — поражение стороны', 'coins': 80},
    {'id': 'court_witness_win', 'group': COURT_GROUP, 'name': 'Суд: Свидетель — победа стороны', 'coins': 100},
    {'id': 'court_witness_lose', 'group': COURT_GROUP, 'name': 'Суд: Свидетель — поражение стороны', 'coins': 60},
    {'id': 'court_juror_win', 'group': COURT_GROUP, 'name': 'Суд: Присяжный — голос совпал с вердиктом', 'coins': 100},
    {'id': 'court_juror_lose', 'group': COURT_GROUP, 'name': 'Суд: Присяжный — голос не совпал с вердиктом', 'coins': 50},
    {'id': 'court_judge', 'group': COURT_GROUP, 'name': 'Суд: Судья — проведение', 'coins': 200},
]
DEEDS += [
    {'id': 'grade_4', 'group': 'Оценка', 'name': 'Оценка 4 (40–44 балла)', 'coins': 80},
    {'id': 'grade_5', 'group': 'Оценка', 'name': 'Оценка 5 (45–50 баллов)', 'coins': 100},
]
# штрафы
PENALTIES = [
    {'name': 'Опоздание на урок', 'amount': 50},
    {'name': 'Опоздание на в школу на первый урок', 'amount': 100},
    {'name': 'Опоздание на мероприятие', 'amount': 50},
    {'name': 'Прогул мероприятия после регистрации без уважительной причины', 'amount': 100},
    {'name': 'Срыв или намеренное нарушение мероприятия', 'amount': 200},
    {'name': 'Создание помех проведению мероприятия', 'amount': 100},
    {'name': 'Неуважительное отношение к дублёрам', 'amount': 200},
    {'name': 'Грубость или оскорбления участников', 'amount': 200},
    {'name': 'Отказ выполнять обоснованные требования организаторов', 'amount': 100},
    {'name': 'Загрязнение помещения / мусор после себя', 'amount': 100},
    {'name': 'Порча школьного имущества', 'amount': 500},
    {'name': 'Самовольный выход за территорию школы', 'amount': 500},
    {'name': 'Курение на территории школы', 'amount': 1000},
    {'name': 'Драка или физическая агрессия', 'amount': 1000},
    {'name': 'Мошенничество при участии в турнирах', 'amount': 500},
    {'name': 'Подделка результатов или попытка обмануть организаторов', 'amount': 500},
]
def deed_amount(deed, value):
    name = deed['name']
    if 'coins' in deed:
        return deed['coins'], name, None

@app.route('/api/deeds', methods=['GET'])
def get_deeds():
    return jsonify(DEEDS)

@app.route('/api/penalties', methods=['GET'])
def get_penalties():
    return jsonify(PENALTIES)

# начисление за дело
@app.route('/api/award_deed', methods=['POST'])
def award_deed():
    data = request.get_json(silent=True) or {}
    token = data.get('token')
    name = data.get('name')
    class_val = data.get('class')
    group_val = data.get('group')
    deed_id = data.get('deed_id')
    if not all([token, name, class_val, group_val, deed_id]):
        return jsonify({'error': 'Все поля обязательны для заполнения'}), 400
    deed = next((d for d in DEEDS if d['id'] == deed_id), None)
    if not deed:
        return jsonify({'error': 'Такого дела нет в списке'}), 400
    amount, reason, err = deed_amount(deed, data.get('value'))
    if err:
        return jsonify({'error': err}), 400
    try:
        giver_name = serializer.loads(token, max_age=86400)
        giver = Student.query.filter_by(name=giver_name, status='дублёр').first()
        if not giver:
            return jsonify({'error': 'Только дублёр может начислять renocoins'}), 403
# renocoins начисляются только ученикам
        student = Student.query.filter_by(
            name=name,
            student_class=class_val,
            group=group_val,
            status='ученик'
        ).first()
        if not student:
            return jsonify({'error': 'Ученик не найден в базе данных школы'}), 404
# это начисление ученик получает только один раз
        if deed.get('once'):
            already = CoinLog.query.filter_by(
                receiver_name=student.name,
                receiver_class=student.student_class,
                receiver_group=student.group,
                action='начислить',
                reason=reason
            ).first()
            if already:
                return jsonify({'error': 'Это начисление ученик уже получал, оно выдаётся только один раз'}), 400
        student.coins = (student.coins or 0) + amount
        db.session.add(CoinLog(
            giver_name=giver.name,
            receiver_name=student.name,
            receiver_class=student.student_class,
            receiver_group=student.group,
            amount=amount,
            action='начислить',
            reason=reason
        ))
        db.session.commit()
        return jsonify({
            'success': True,
            'message': f'Начислено {amount} renocoins: {reason}'
        }), 200
    except BadSignature:
        return jsonify({'error': 'Сессия устарела. Войдите заново.'}), 401
    except Exception:
        db.session.rollback()
        return jsonify({'error': 'Ошибка при начислении renocoins'}), 500

# ручное начисление для админов
@app.route('/api/admin/award_custom', methods=['POST'])
def admin_award_custom():
    data = request.get_json(silent=True) or {}
    admin = get_admin(data.get('token'))
    if not admin:
        return jsonify({'error': 'Доступ запрещён'}), 403
    name = data.get('name')
    class_val = data.get('class')
    group_val = data.get('group')
    reason = (data.get('reason') or '').strip()[:255]
    try:
        amount = int(data.get('amount'))
    except (TypeError, ValueError):
        return jsonify({'error': 'Количество renocoins должно быть целым числом'}), 400
    if not all([name, class_val, group_val, reason]):
        return jsonify({'error': 'Все поля обязательны для заполнения'}), 400
    if amount <= 0:
        return jsonify({'error': 'Количество renocoins должно быть больше нуля'}), 400
    if amount > 10**9:
        return jsonify({'error': 'Слишком большое число'}), 400
    try:
        student = Student.query.filter_by(
            name=name,
            student_class=class_val,
            group=group_val,
            status='ученик'
        ).first()
        if not student:
            return jsonify({'error': 'Ученик не найден в базе данных школы'}), 404
        student.coins = (student.coins or 0) + amount
        db.session.add(CoinLog(
            giver_name=admin.name,
            receiver_name=student.name,
            receiver_class=student.student_class,
            receiver_group=student.group,
            amount=amount,
            action='начислить',
            reason=reason
        ))
        db.session.commit()
        return jsonify({
            'success': True,
            'message': f'Начислено {amount} renocoins: {reason}'
        }), 200
    except Exception:
        db.session.rollback()
        return jsonify({'error': 'Ошибка при начислении renocoins'}), 500

# подгрузка логов renocoins для профиля
@app.route('/api/get_coin_logs', methods=['GET'])
def get_coin_logs():
    token = request.args.get('token')
    if not token:
        return jsonify([]), 400
    try:
        user_name = serializer.loads(token, max_age=86400)
        student = Student.query.filter_by(name=user_name).first()
        if student and student.status == 'дублёр':
            logs = CoinLog.query.filter_by(
                giver_name=user_name
            ).order_by(
                CoinLog.timestamp.desc()
            ).all()
            return jsonify([
                {
                    'receiver_name': log.receiver_name,
                    'receiver_class': log.receiver_class,
                    'receiver_group': log.receiver_group,
                    'amount': log.amount,
                    'action': log.action,
                    'reason': log.reason,
                    'timestamp': log.timestamp.strftime('%d.%m.%Y %H:%M')
                }
                for log in logs
            ])
        logs = CoinLog.query.filter_by(
            receiver_name=user_name
        ).order_by(
            CoinLog.timestamp.desc()
        ).all()
        return jsonify([
            {
                'giver_name': log.giver_name,
                'amount': log.amount,
                'action': log.action,
                'reason': log.reason,
                'timestamp': log.timestamp.strftime('%d.%m.%Y %H:%M')
            }
            for log in logs
        ])
    except Exception as e:
        return jsonify({'error': str(e)}), 500

# подгрузка жалоб на дублера для профиля
@app.route('/api/get_complaints', methods=['GET'])
def get_complaints():
    token = request.args.get('token')
    if not token:
        return jsonify([]), 400
    try:
        user_name = serializer.loads(token, max_age=86400)
        student = Student.query.filter_by(name=user_name).first()
        if not student or student.status != 'дублёр':
            return jsonify([]), 200
        complaints = Complaint.query.filter_by(
            dubler_name=user_name
        ).order_by(
            Complaint.timestamp.desc()
        ).all()
        return jsonify([
            {
                'complainant_name': c.complainant_name,
                'complainant_class': c.complainant_class,
                'complainant_group': c.complainant_group,
                'timestamp': c.timestamp.strftime('%d.%m.%Y %H:%M')
            }
            for c in complaints
        ])
    except Exception:
        return jsonify({'error': 'Ошибка при загрузке жалоб'}), 500

# смена пароля из профиля
@app.route('/api/change_password', methods=['POST'])
def change_password():
    data = request.get_json(silent=True) or {}
    token = data.get('token')
    old_password = data.get('old_password')
    new_password = data.get('new_password')
    confirm_password = data.get('confirm_password')
    if not all([token, old_password, new_password, confirm_password]):
        return jsonify({'error': 'Все поля обязательны для заполнения'}), 400
    if new_password != confirm_password:
        return jsonify({'error': 'Новые пароли не совпадают'}), 400
    if len(new_password) < 6:
        return jsonify({'error': 'Новый пароль должен быть не короче 6 символов'}), 400
    if len(new_password) > 128:
        return jsonify({'error': 'Новый пароль слишком длинный'}), 400
    if new_password == old_password:
        return jsonify({'error': 'Новый пароль должен отличаться от текущего'}), 400
    try:
        user_name = serializer.loads(token, max_age=86400)
        student = Student.query.filter_by(name=user_name).first()
# проверяем текущий пароль по хешу из базы
        if not check_password_hash(student.password, old_password):
            return jsonify({'error': 'Текущий пароль указан неверно'}), 400
        student.password = generate_password_hash(new_password)
        db.session.commit()
        return jsonify({
            'success': True,
            'message': 'Пароль успешно изменён!'
        }), 200
    except BadSignature:
        return jsonify({'error': 'Сессия устарела. Войдите заново.'}), 401
    except Exception:
        db.session.rollback()
        return jsonify({'error': 'Ошибка при смене пароля'}), 500

# МАГАЗИН

SHOP_OPEN = False

SHOP_ITEMS = [
    {'name': 'Добавить 0.5 балла к зачётной оценке', 'price': None, 'count': 20,
     'image': 'image/shop/plus_05_zachet.png', 'desc': 'Большой апгрейд оценки.'},
    {'name': 'Добавить 0.5 балла к выставленной оценке', 'price': None, 'count': 100,
     'image': 'image/shop/plus_05_ocenka.png', 'desc': 'Апгрейд оценки.'},
    {'name': 'Мармелад', 'price': None, 'count': 35,
     'image': 'image/shop/marmelad.png', 'desc': 'Сладкое никогда не лишнее.'},
    {'name': 'Сертификат WB на 500р', 'price': None, 'count': 4,
     'image': 'image/shop/wb_koshelek.png', 'desc': 'Твоя корзина до сих пор полная.'},
    {'name': 'Яндекс Плюс на месяц', 'price': None, 'count': 2,
     'image': 'image/shop/yandex_plus.png', 'desc': 'Кто там сейчас в чартах?'},
    {'name': 'Сертификат Додо Пицца на большую пиццу', 'price': None, 'count': 1,
     'image': 'image/shop/dodo_pizza.png', 'desc': 'Большая пицца найдёт, куда поместиться.'},
    {'name': 'Сертификат 500р в Летуаль', 'price': None, 'count': 2,
     'image': 'image/shop/letual_500.png', 'desc': 'Позволь себе Dior.'},
]

@app.route('/api/shop', methods=['GET'])
def get_shop():
    result = []
    for item in SHOP_ITEMS:
        bought = Purchase.query.filter_by(
            product_name=item['name']
        ).count()
        result.append({
            'name': item['name'],
            'price': item['price'],
            'left': max(item['count'] - bought, 0),
            'image': item['image'],
            'desc': item['desc'],
            'open': SHOP_OPEN and item['price'] is not None
        })

    return jsonify(result)

@app.route('/api/buy', methods=['POST'])
def buy_product():
    data = request.get_json(silent=True) or {}
    token = data.get('token')
    product_name = data.get('product_name')
    try:
        user_name = serializer.loads(token, max_age=86400)
        student = Student.query.filter_by(name=user_name).first()
        if not student:
            return jsonify({'error': 'Пользователь не найден'}), 404
        item = next(
            (x for x in SHOP_ITEMS if x['name'] == product_name),
            None
        )
        if not item:
            return jsonify({'error': 'Товар не найден'}), 404
        if not SHOP_OPEN or item['price'] is None:
            return jsonify({'error': 'Покупки пока недоступны: цены ещё не объявлены'}), 403
        if student.coins < item['price']:
            return jsonify({'error': 'Недостаточно renocoins'}), 400
        bought = Purchase.query.filter_by(
            product_name=product_name
        ).count()
        if bought >= item['count']:
            return jsonify({'error': 'Товар закончился'}), 400
        student.coins -= item['price']
        if student.buying:
            student.buying += ', ' + item['name']
        else:
            student.buying = item['name']
        purchase = Purchase(
            buyer_name=student.name,
            product_name=item['name'],
            price=item['price']
        )
        purchase_log = CoinLog(
            giver_name='Магазин',
            receiver_name=student.name,
            receiver_class=student.student_class,
            receiver_group=student.group,
            amount=item['price'],
            action='списать',
            reason='Покупка: ' + item['name']
        )
        db.session.add(purchase)
        db.session.add(purchase_log)
        db.session.commit()
        return jsonify({
            'success': True,
            'coins': student.coins
        })
    except BadSignature:
        return jsonify({'error': 'Сессия устарела. Войдите заново.'}), 401
    except Exception:
        db.session.rollback()
        return jsonify({'error': 'Ошибка при покупке'}), 500

@app.route('/api/get_purchases', methods=['GET'])
def get_purchases():
    token = request.args.get('token')
    if not token:
        return jsonify([]), 400
    try:
        user_name = serializer.loads(token, max_age=86400)
        purchases = Purchase.query.filter_by(
            buyer_name=user_name
        ).order_by(
            Purchase.timestamp.desc()
        ).all()
        return jsonify([
            {
                'product_name': p.product_name,
                'price': p.price,
                'timestamp': p.timestamp.strftime('%d.%m.%Y %H:%M')
            }
            for p in purchases
        ])
    except Exception:
        return jsonify({'error': 'Недействительный токен'}), 401

# АДМИН ПАНЕЛЬ

@app.route('/api/admin/coin_logs', methods=['GET'])
def admin_coin_logs():
    if not get_admin(request.args.get('token')):
        return jsonify({'error': 'Доступ запрещён'}), 403
    logs = CoinLog.query.order_by(CoinLog.timestamp.desc()).all()
    return jsonify([
        {
            'giver_name': l.giver_name,
            'receiver_name': l.receiver_name,
            'receiver_class': l.receiver_class,
            'receiver_group': l.receiver_group,
            'amount': l.amount,
            'action': l.action,
            'reason': l.reason,
            'timestamp': l.timestamp.strftime('%d.%m.%Y %H:%M')
        }
        for l in logs
    ])

@app.route('/api/admin/purchases', methods=['GET'])
def admin_purchases():
    if not get_admin(request.args.get('token')):
        return jsonify({'error': 'Доступ запрещён'}), 403
    purchases = Purchase.query.order_by(Purchase.timestamp.desc()).all()
    return jsonify([
        {
            'buyer_name': p.buyer_name,
            'product_name': p.product_name,
            'price': p.price,
            'timestamp': p.timestamp.strftime('%d.%m.%Y %H:%M')
        }
        for p in purchases
    ])

@app.route('/api/admin/complaints', methods=['GET'])
def admin_complaints():
    if not get_admin(request.args.get('token')):
        return jsonify({'error': 'Доступ запрещён'}), 403
    complaints = Complaint.query.order_by(Complaint.timestamp.desc()).all()
    return jsonify([
        {
            'complainant_name': c.complainant_name,
            'complainant_class': c.complainant_class,
            'complainant_group': c.complainant_group,
            'dubler_name': c.dubler_name,
            'dubler_class': c.dubler_class,
            'dubler_group': c.dubler_group,
            'reason': c.reason,
            'timestamp': c.timestamp.strftime('%d.%m.%Y %H:%M')
        }
        for c in complaints
    ])

# renocoins и соцрейтинг только дублёров
@app.route('/api/admin/dublers', methods=['GET'])
def admin_dublers():
    if not get_admin(request.args.get('token')):
        return jsonify({'error': 'Доступ запрещён'}), 403
    dublers = Student.query.filter_by(status='дублёр').order_by(Student.name).all()
    ratings = {r.dubler_name: r.rating for r in DublerRating.query.all()}
    return jsonify([
        {
            'name': d.name,
            'class': d.student_class,
            'group': d.group,
            'coins': d.coins or 0,
            'rating': ratings.get(d.name, START_RATING)
        }
        for d in dublers
    ])

# начислить или снять соцрейтинг (delta > 0 начисляет, delta < 0 снимает)
@app.route('/api/admin/rating', methods=['POST'])
def admin_change_rating():
    data = request.get_json(silent=True) or {}
    admin = get_admin(data.get('token'))
    if not admin:
        return jsonify({'error': 'Доступ запрещён'}), 403
    name = data.get('name')
    reason = (data.get('reason') or '').strip()[:255]
    try:
        delta = int(data.get('delta'))
    except (TypeError, ValueError):
        return jsonify({'error': 'Количество должно быть целым числом'}), 400
    if not name or not reason:
        return jsonify({'error': 'Укажите дублёра и причину'}), 400
    if delta == 0:
        return jsonify({'error': 'Изменение не может быть нулём'}), 400
    if abs(delta) > 10**9:
        return jsonify({'error': 'Слишком большое число'}), 400
    try:
        dubler = Student.query.filter_by(name=name, status='дублёр').first()
        row = get_rating_row(dubler.name)
        row.rating += delta
        db.session.add(RatingLog(
            dubler_name=dubler.name,
            admin_name=admin.name,
            delta=delta,
            reason=reason
        ))
        db.session.commit()
        return jsonify({'success': True, 'rating': row.rating}), 200
    except Exception:
        db.session.rollback()
        return jsonify({'error': 'Ошибка при изменении рейтинга'}), 500

@app.route('/api/admin/rating_logs', methods=['GET'])
def admin_rating_logs():
    if not get_admin(request.args.get('token')):
        return jsonify({'error': 'Доступ запрещён'}), 403
    logs = RatingLog.query.order_by(RatingLog.timestamp.desc()).all()
    return jsonify([
        {
            'dubler_name': l.dubler_name,
            'admin_name': l.admin_name,
            'delta': l.delta,
            'reason': l.reason,
            'timestamp': l.timestamp.strftime('%d.%m.%Y %H:%M')
        }
        for l in logs
    ])

# ТОПЫ

# категория по классу
def class_category(cls):
    try:
        n = int(cls)
    except (TypeError, ValueError):
        return None
    if 5 <= n <= 6:
        return 'rvg'
    if 7 <= n <= 9:
        return 'ppg'
    if 10 <= n <= 11:
        return 'profile'
    return None

@app.route('/api/top', methods=['GET'])
def get_top():
    try:
        rows = db.session.query(
            CoinLog.receiver_name,
            CoinLog.receiver_class,
            CoinLog.receiver_group,
            CoinLog.action,
            CoinLog.amount,
            CoinLog.giver_name
        ).all()
        earned = {}
        for name, cls, grp, action, amount, giver in rows:
            if amount is None or amount <= 0:
                continue
            key = (name, str(cls), grp)
            if action == 'начислить':
                earned[key] = earned.get(key, 0) + amount
            elif action == 'списать' and giver != 'Магазин':
                earned[key] = earned.get(key, 0) - amount
        categories = ['rvg', 'ppg', 'profile']
        student_lists = {c: [] for c in categories}
        group_totals = {c: {} for c in categories}
        for st in Student.query.filter_by(status='ученик').all():
            cat = class_category(st.student_class)
            if cat is None:
                continue
            total = earned.get((st.name, str(st.student_class), st.group), 0)
            student_lists[cat].append({
                'name': st.name,
                'class': st.student_class,
                'group': st.group,
                'coins': total
            })
            group_totals[cat][st.group] = group_totals[cat].get(st.group, 0) + total
        top_students = {}
        top_groups = {}
        for cat in categories:
            lst = [x for x in student_lists[cat] if x['coins'] > 0]
            lst.sort(key=lambda x: (-x['coins'], x['name']))
            lst = lst[:10]
            for i, item in enumerate(lst, start=1):
                item['place'] = i
            top_students[cat] = lst
            glist = [
                {'group': g, 'coins': total}
                for g, total in group_totals[cat].items()
                if total > 0
            ]
            glist.sort(key=lambda x: (-x['coins'], x['group']))
            glist = glist[:10]
            for i, item in enumerate(glist, start=1):
                item['place'] = i
            top_groups[cat] = glist
        return jsonify({'students': top_students, 'groups': top_groups})
    except Exception as e:
        return jsonify({'error': str(e)}), 500
# локальный запуск
if __name__ == '__main__':
    app.run(host='0.0.0.0', debug=False, port=5000)
