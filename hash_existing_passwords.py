"""Разовый скрипт: превращает пароли открытым текстом в хеши.

Запускать один раз, рядом с app.py, на той машине, где лежит база:
    python hash_existing_passwords.py

Уже хешированные пароли пропускаются, так что повторный запуск безопасен.
Путь к базе берётся так же, как в app.py (переменная DATABASE_PATH).
"""
from werkzeug.security import generate_password_hash

from app import app, db, Student

# хеши werkzeug начинаются с названия метода: scrypt:..., pbkdf2:...
HASH_PREFIXES = ("scrypt:", "pbkdf2:")

with app.app_context():
    changed = 0
    for student in Student.query.filter(Student.password != "").all():
        if student.password and not student.password.startswith(HASH_PREFIXES):
            student.password = generate_password_hash(student.password)
            changed += 1
    db.session.commit()
    print(f"Захешировано паролей: {changed}")
