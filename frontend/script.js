// иконки Font Awesome подключаем со своего сайта (kit.fontawesome.com не грузится)
(function () {
    if (!document.querySelector('link[href*="fontawesome/css/all.min.css"]')) {
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = 'fontawesome/css/all.min.css';
        document.head.appendChild(link);
    }
})();

document.addEventListener("DOMContentLoaded", () => { // обработчик, чтобы сначала прогрузилась страница
    const API_BASE = "https://samoupravlenie2026.online/"; // адрес бэкенда, слэш на конце обязателен

    // ==============================
    // ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ВЫВОДА (без innerHTML для данных от пользователей)
    // ==============================

    // одна строка-сообщение внутри блока (например "Пока что записей нет.")
    function setMessage(box, text) {
        box.innerHTML = ''; // очищаем блок
        const p = document.createElement('p'); // создаем абзац
        p.textContent = text; // текст как текст, а не как html
        box.appendChild(p); // добавляем в блок
    }

    // одна запись истории renocoins
    function makeLogEntry(log, isDubler) {
        const div = document.createElement('div'); // создаем тег для одной записи лога
        div.className = 'log-entry'; // задаем класс записи
        const isPlus = log.action === 'начислить'; // начисление или списание

        const amountSpan = document.createElement('span'); // сумма с цветом
        amountSpan.className = isPlus ? 'log-plus' : 'log-minus'; // класс цвета
        amountSpan.textContent = `${isPlus ? '+' : '-'}${log.amount} renocoins`; // текст суммы
        div.appendChild(amountSpan);

        const text = isDubler // дублеру показываем кому, ученику - от кого
            ? ` ученику ${log.receiver_name} (${log.receiver_class} ${log.receiver_group}) — ${log.reason} `
            : ` от ${log.giver_name} — ${log.reason} `;
        div.appendChild(document.createTextNode(text)); // текст как текст
        div.appendChild(document.createElement('br')); // перенос строки

        const small = document.createElement('small'); // дата
        small.textContent = log.timestamp;
        div.appendChild(small);
        return div;
    }

    // заполняет блок историей renocoins
    function renderCoinLogs(box, logs, isDubler) {
        box.innerHTML = ''; // очищаем блок перед заполнением
        logs.forEach(log => box.appendChild(makeLogEntry(log, isDubler))); // добавляем записи
    }

    // одна запись жалобы (причину дублеру намеренно не показываем)
    function makeComplaintEntry(c) {
        const div = document.createElement('div');
        div.className = 'log-entry';
        div.appendChild(document.createTextNode(`${c.complainant_name} из ${c.complainant_class} ${c.complainant_group} написал(а) на вас жалобу `));
        div.appendChild(document.createElement('br'));
        const small = document.createElement('small');
        small.textContent = c.timestamp;
        div.appendChild(small);
        return div;
    }

    // ==============================
    // БУРГЕР НА ТЕЛЕФОНАХ
    // ==============================
    const burgerBtn = document.getElementById('burgerBtn'); // кнопка бургера
    if (burgerBtn) { // если кнопка существует
        burgerBtn.addEventListener('click', () => { // ждем клик
            document.getElementById('mobileNav').classList.toggle('active'); // переключаем active у меню
        });
    }

    const closeBtn = document.getElementById('closeBtn'); // кнопка крестика
    if (closeBtn) { // если кнопка существует
        closeBtn.addEventListener('click', () => { // ждем клик
            document.getElementById('mobileNav').classList.remove('active'); // убираем active у меню
            document.getElementById('mobileSubmenu').classList.remove('open'); // убираем open у подменю
        });
    }

    document.querySelectorAll('.nav-link-close').forEach(link => { // все ссылки, которые закрывают меню
        link.addEventListener('click', () => { // ждет клик на любую ссылку из списка
            const mobileNav = document.getElementById('mobileNav'); // меню
            const mobileSubmenu = document.getElementById('mobileSubmenu'); // подменю
            if (mobileNav) mobileNav.classList.remove('active'); // закрываем меню
            if (mobileSubmenu) mobileSubmenu.classList.remove('open'); // закрываем подменю
        });
    });

    const cabinetDropdown = document.getElementById('cabinetDropdown'); // кнопка подменю кабинета
    if (cabinetDropdown) { // если подменю существует
        cabinetDropdown.addEventListener('click', (e) => { // ждем клик
            e.preventDefault(); // чтобы страница не прыгала вверх
            const mobileSubmenu = document.getElementById('mobileSubmenu'); // подменю
            if (mobileSubmenu) mobileSubmenu.classList.toggle('open'); // переключаем open
        });
    }

    // ==============================
    // СЕССИЯ
    // ==============================
    const tokenLocal = localStorage.getItem('authToken'); // токен из памяти если была нажата кнопка запомнить меня
    const tokenSession = sessionStorage.getItem('authToken'); // токен из сессионной памяти
    const cleanLocal = (tokenLocal && tokenLocal !== 'null' && tokenLocal !== 'undefined') ? tokenLocal : null; // проверка на существование
    const cleanSession = (tokenSession && tokenSession !== 'null' && tokenSession !== 'undefined') ? tokenSession : null; // проверка на существование
    const currentToken = cleanLocal || cleanSession; // сохраняем токен, если нету - пользователь не вошел в аккаунт

    // приводим путь к единому виду: без .html и без закрывающего слеша
    const currentPath = window.location.pathname.toLowerCase()
        .replace(/\.html$/, '')
        .replace(/\/+$/, '') || '/';
    let userStatus = null; // статус текущего пользователя (ученик / дублёр)
    const isLoginPage = currentPath === '/' || currentPath === '/index' || currentPath === '/login'; // index.html теперь страница входа
    const isImDublerPage = currentPath === '/imdubler';
    const isPublicPage = isLoginPage || isImDublerPage; // страницы, доступные без входа
    const isDublerPage = currentPath === '/dubler';
    const isNedublerPage = currentPath === '/nedubler';
    const isAdminPage = currentPath === '/admin';

    if (isPublicPage && currentToken) { // если мы на публичной странице и есть токен
        window.location.href = 'main.html'; // перебрасываем на главную
        return; // стоп
    }

    function kickOut(message) { // функция кика
        localStorage.removeItem('authToken'); // удаляем токен из локальной памяти
        sessionStorage.removeItem('authToken'); // удаляем токен из сессионной памяти
        if (message) alert(message); // если есть сообщение кика
        window.location.href = 'index.html'; // перенаправляем на страницу входа
    }

    if (!isPublicPage) { // если страница не публичная
        if (!currentToken) { // если токена нету
            kickOut('Доступ запрещён! Сначала войдите в аккаунт.'); // выкидываем с сообщением
            return; // стоп функции
        }

        if (currentToken === 'guest') { // если вошел гость
            if (isAdminPage) window.location.href = 'main.html'; // гость не админ
            const userSpan = document.getElementById("user"); // поле для имени
            if (userSpan) userSpan.textContent = "Гость";
            const statusSpan = document.getElementById("status"); // поле для статуса
            if (statusSpan) statusSpan.textContent = "отсутствует";
            const groupSpan = document.getElementById("group"); // поле для группы
            if (groupSpan) groupSpan.textContent = "неизвестна";
            const coinsSpan = document.getElementById("coins"); // поле для renocoins
            if (coinsSpan) coinsSpan.textContent = 0;
            const guestLogsBox = document.getElementById('coinLogs'); // блок истории renocoins в профиле
            if (guestLogsBox) guestLogsBox.textContent = 'История отсутствует'; // у гостя истории нет, вместо вечной загрузки
            const guestPasswordCard = document.getElementById('passwordCard'); // у гостя нет аккаунта, смены пароля нет
            if (guestPasswordCard) guestPasswordCard.style.display = 'none';
            if (isDublerPage) window.location.href = 'nedubler.html'; // гость не дублер - отправляем на страницу жалоб
        } else { // если не гость
            // профиль
            fetch(`${API_BASE}api/verify_user?token=${encodeURIComponent(currentToken)}`) // запрос к бэкенду
                .then(res => res.json()) // перевод json в js объект
                .then(data => {
                    if (data.exists) { // если токен существует и сессия активна
                        userStatus = data.status || null; // запоминаем статус в любом случае, он нужен для истории renocoins

                        const adminNavItem = document.getElementById('adminNavItem'); // ссылка на админку в меню (скрыта по умолчанию)
                        if (adminNavItem && data.is_admin) adminNavItem.style.display = '';
                        if (isAdminPage) {
                            if (data.is_admin) loadAdminData();
                            else window.location.href = 'main.html'; // не админ
                        }

                        const customBox = document.getElementById('customAwardBox'); // ручное начисление, видно только админам
                        if (customBox && data.is_admin) customBox.style.display = '';

                        const userSpan = document.getElementById("user"); // элемент для имени
                        if (userSpan && data.name) {
                            userSpan.textContent = data.name;
                        }
                        const statusSpan = document.getElementById("status"); // элемент для статуса
                        if (statusSpan && data.status) {
                            statusSpan.textContent = data.status;
                        }
                        const groupSpan = document.getElementById("group"); // элемент для группы
                        if (groupSpan && data.group) {
                            groupSpan.textContent = data.group;
                        }
                        const coinsSpan = document.getElementById("coins"); // элемент для renocoins
                        if (coinsSpan) { // если элемент для renocoins существует
                            const coinsValue = (data.coins !== undefined && data.coins !== null) ? data.coins : 0;
                            coinsSpan.textContent = coinsValue;
                        }

                        // соцрейтинг дублёра (только в профиле дублёра)
                        const ratingRow = document.getElementById('ratingRow');
                        const ratingSpan = document.getElementById('rating');
                        if (ratingRow && ratingSpan && data.status === 'дублёр' && data.rating !== null && data.rating !== undefined) {
                            ratingSpan.textContent = data.rating;
                            ratingRow.style.display = '';
                        }

                        if (isDublerPage && data.status != 'дублёр') { // на странице дублера, но статус не дублер - кидаем на страницу жалоб
                            window.location.href = 'nedubler.html';
                        }
                        if (isNedublerPage && data.status == 'дублёр') { // на странице жалоб, но статус дублер - кидаем на главную
                            window.location.href = 'main.html';
                        }

                        // логи начислений и списаний renocoins (для профиля)
                        const coinLogsBox = document.getElementById('coinLogs'); // блок логов renocoins
                        if (coinLogsBox) { // если блок логов существует на странице
                            fetch(`${API_BASE}api/get_coin_logs?token=${encodeURIComponent(currentToken)}`) // запрос за логами renocoins
                                .then(res => res.json())
                                .then(logs => {
                                    if (logs.error) { // если бэкенд вернул ошибку
                                        setMessage(coinLogsBox, 'Ошибка загрузки логов: ' + logs.error);
                                        return;
                                    }
                                    if (logs.length === 0) { // если логов нету
                                        setMessage(coinLogsBox, 'Пока что записей нет.');
                                        return;
                                    }
                                    renderCoinLogs(coinLogsBox, logs, data.status === 'дублёр'); // рисуем историю
                                })
                                .catch(error => {
                                    setMessage(coinLogsBox, 'Ошибка загрузки логов.');
                                });
                        }

                        // жалобы на дублера (для профиля, только если это профиль дублера)
                        if (data.status === 'дублёр') {
                            const complaintsSection = document.getElementById('complaintsSection'); // блок жалоб
                            const complaintLogsBox = document.getElementById('complaintLogs'); // блок логов жалоб
                            if (complaintsSection && complaintLogsBox) {
                                complaintsSection.style.display = 'block'; // показываем блок жалоб
                                fetch(`${API_BASE}api/get_complaints?token=${encodeURIComponent(currentToken)}`)
                                    .then(res => res.json())
                                    .then(complaints => {
                                        if (complaints.error) {
                                            setMessage(complaintLogsBox, 'Ошибка загрузки жалоб: ' + complaints.error);
                                            return;
                                        }
                                        if (complaints.length === 0) {
                                            setMessage(complaintLogsBox, 'Жалоб пока нет.');
                                            return;
                                        }
                                        complaintLogsBox.innerHTML = ''; // очищаем блок перед заполнением
                                        complaints.forEach(c => complaintLogsBox.appendChild(makeComplaintEntry(c)));
                                    })
                                    .catch(error => {
                                        setMessage(complaintLogsBox, 'Ошибка загрузки жалоб.');
                                    });
                            }
                        }
                    }
                    else { // если токен недействителен
                        kickOut('Сессия устарела или недействительна. Войдите заново.');
                    }
                })
                .catch(err => { // если получили ошибку
                    kickOut('Ошибка безопасности. Пожалуйста, авторизуйтесь заново.');
                });
        }
    } // конец проверки публичной страницы

    // ==============================
    // ВХОД
    // ==============================
    const dataOption = { // коробка массивов
        "5": ["РВГ-1", "РВГ-2", "РВГ-3", "РВГ-4", "РВГ-5", "РВГ-6"],
        "6": ["РВГ-1", "РВГ-2", "РВГ-3", "РВГ-4", "РВГ-5", "РВГ-6"],
        "7": ["ППГ-1", "ППГ-2", "ППГ-3", "ППГ-4", "ППГ-5", "ППГ-6", "ППГ-7", "ППГ-8"],
        "8": ["ППГ-1", "ППГ-2", "ППГ-3", "ППГ-4", "ППГ-5", "ППГ-6", "ППГ-7", "ППГ-8"],
        "9": ["ППГ-1", "ППГ-2", "ППГ-3", "ППГ-4", "ППГ-5", "ППГ-6", "ППГ-7", "ППГ-8"],
        "10": ["ФМ", "ИТ", "ХБ", "СГ-1", "СГ-2"],
        "11": ["ФМ", "ИТ", "ХБ", "СГ-1", "СГ-2"]
    };

    const classSelect = document.getElementById('classSelect'); // список классов
    const dynamicSelect = document.getElementById('dynamicSelect'); // список групп, который потом оживет
    const nameSelect = document.getElementById('nameSelect'); // список имен, который потом оживет
    const passwordInput = document.getElementById('exampleInputPassword1'); // поле ввода пароля
    const errorContainer = document.getElementById('passwordError'); // блок ошибок и подсказок
    const loginBtn = document.getElementById('loginBtn'); // кнопка входа
    const guestBtn = document.getElementById('guestBtn'); // кнопка входа гостя

    // первый выпадающий список
    if (classSelect) { // если список классов существует
        classSelect.addEventListener('change', function() { // ждет выбор из списка
            dynamicSelect.innerHTML = '<option value="" selected disabled>Выберите группу...</option>'; // текст на кнопке группы
            dynamicSelect.disabled = false; // разблок списка групп
            nameSelect.innerHTML = '<option value="" selected disabled>Сначала выберите класс и группу...</option>'; // текст на кнопке имени
            nameSelect.disabled = true; // блок списка имен

            dataOption[this.value].forEach(group => { // цикл по массиву доступных вариантов
                const option = document.createElement('option'); // тег option для пункта списка
                option.value = group; // значение
                option.textContent = group; // видимый текст
                dynamicSelect.appendChild(option); // вставляем во второй список
            });
        });
    }

    // второй выпадающий список
    if (dynamicSelect) { // если список групп существует
        dynamicSelect.addEventListener('change', function() { // ждет выбор из списка
            const selectedClass = classSelect.value; // выбранный класс
            const selectedGroup = this.value; // выбранная группа
            nameSelect.innerHTML = '<option value="" selected disabled>Загрузка списка имён...</option>'; // текст внутри кнопки списка
            nameSelect.disabled = true; // блокирует список имен

            let fetchUrl = ''; // адрес запроса, зависит от страницы
            if (isLoginPage) { // страница входа ученика
                fetchUrl = `${API_BASE}api/get_registered_students?class=${selectedClass}&group=${selectedGroup}`;
            } else if (isImDublerPage) { // страница входа дублера
                fetchUrl = `${API_BASE}api/get_registered_dublers?class=${selectedClass}&group=${selectedGroup}`;
            } else if (isDublerPage) { // страница дублера (начисление renocoins): ученики, которым будем начислять renocoins
                fetchUrl = `${API_BASE}api/get_registered_students?class=${selectedClass}&group=${selectedGroup}`;
            }

            fetch(fetchUrl) // запрос на бэкенд
                .then(response => response.json())
                .then(students => {
                    nameSelect.innerHTML = '<option value="" selected disabled>Выберите ваше имя...</option>'; // надпись на разблокированном списке имен

                    if (students.length === 0) { // если список учеников пустой
                        nameSelect.innerHTML = '<option value="" selected disabled>Нет доступных учеников</option>';
                        return;
                    }
                    students.forEach(name => { // цикл по списку доступных вариантов
                        const option = document.createElement('option');
                        option.value = name;
                        option.textContent = name;
                        nameSelect.appendChild(option);
                    });
                    nameSelect.disabled = false; // разблок списка имен
                })
                .catch(error => {
                    nameSelect.innerHTML = '<option value="" selected disabled>Ошибка связи с сервером</option>';
                });
        });
    }

    // защита от спама паролем: блокируем кнопку входа на несколько секунд
    let loginLocked = false;
    function lockLogin(seconds) {
        loginLocked = true;
        if (loginBtn) loginBtn.disabled = true;
        setTimeout(() => {
            loginLocked = false;
            if (loginBtn) loginBtn.disabled = false;
        }, seconds * 1000);
    }

    // отправка формы входа
    function submitForm(url, redirectUrl) {
        if (loginLocked) return; // идёт пауза после неудачной попытки

        const classVal = classSelect.value; // выбранный класс
        const groupVal = dynamicSelect.value; // выбранная группа
        const nameVal = nameSelect.value; // выбранное имя
        const passVal = passwordInput.value; // введенный пароль

        if (!classVal || !groupVal || !nameVal || !passVal) { // если чего то нет
            if (errorContainer) {
                errorContainer.textContent = '❌ Заполните все поля формы!';
                errorContainer.style.color = 'red';
            }
            return;
        }

        const payload = { // формируем сообщение на бэкенд
            class: classVal,
            group: groupVal,
            name: nameVal,
            password: passVal
        };

        fetch(url, { // запрос на бэкенд
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        })
        .then(res => res.json())
        .then(data => {
            if (data.error) { // если пришла ошибка
                if (errorContainer) {
                    errorContainer.textContent = '❌ Ошибка: ' + data.error;
                    errorContainer.style.color = 'red';
                }
                passwordInput.value = ''; // очищаем поле пароля
                lockLogin(data.retry_after || 3); // пауза перед следующей попыткой
                return;
            }

            if (!data.token) { // если нет токена
                if (errorContainer) {
                    errorContainer.textContent = '❌ Системная ошибка: нет токена авторизации';
                    errorContainer.style.color = 'red';
                }
                return;
            }

            if (errorContainer) { // вход удался
                errorContainer.textContent = '✅ ' + data.message;
                errorContainer.style.color = 'green';
            }

            const rememberMeCheckbox = document.getElementById('rememberMe'); // галочка "запомнить меня"
            const shouldRemember = rememberMeCheckbox ? rememberMeCheckbox.checked : false;

            if (shouldRemember) { // если галочку нажали
                localStorage.setItem('authToken', data.token); // токен в локальную память
                sessionStorage.removeItem('authToken');
            } else { // если не нажали
                sessionStorage.setItem('authToken', data.token); // токен в сессионную память
                localStorage.removeItem('authToken');
            }

            setTimeout(() => { // задержка перед перенаправлением на другую страницу
                window.location.href = redirectUrl;
            }, 500);
        })
        .catch(err => {
            lockLogin(3); // пауза и после ошибки связи
            if (errorContainer) {
                errorContainer.textContent = '❌ Ошибка при связи с сервером';
                errorContainer.style.color = 'red';
            }
        });
    }

    // вход
    if (loginBtn) { // если существует кнопка входа
        loginBtn.addEventListener('click', function(e) { // ждем клик
            e.preventDefault(); // блок перезагрузки
            submitForm(`${API_BASE}api/login`, 'main.html'); // запрос на бэкенд
        });
    }

    // вход как гость
    if (guestBtn) { // если существует кнопка входа как гость
        guestBtn.addEventListener('click', function(e) {
            e.preventDefault();
            localStorage.removeItem('authToken'); // удаляем токен из локальной памяти
            sessionStorage.setItem('authToken', 'guest'); // сохраняем метку гостя
            window.location.href = 'main.html'; // перенаправляем на главную страницу
        });
    }

    // выход из аккаунта
    const logoutBtn = document.getElementById('logoutBtn'); // кнопка выхода
    if (logoutBtn) {
        logoutBtn.addEventListener('click', function(e) {
            e.preventDefault();
            localStorage.removeItem('authToken');
            sessionStorage.removeItem('authToken');
            window.location.href = 'index.html'; // переход на страницу входа
        });
    }

    // на страницу дублера
    const dublerBtn = document.getElementById('dublerBtn');
    if (dublerBtn) {
        dublerBtn.addEventListener('click', function(e) {
            e.preventDefault();
            window.location.href = 'dubler.html'; // страница сама через verify_user проверит статус и кинет на nedubler.html если это не дублер
        });
    }

    // ==============================
    // ЖАЛОБЫ НА ДУБЛЕРОВ
    // ==============================
    // список дублеров для жалобы (страница nedubler)
    const dublerSelect = document.getElementById('dublerSelect');
    if (dublerSelect) {
        fetch(`${API_BASE}api/get_all_dublers`) // список всех дублеров школы
            .then(res => res.json())
            .then(dublers => {
                dublerSelect.innerHTML = '<option value="" selected disabled>Выберите дублёра...</option>';
                if (dublers.length === 0) {
                    dublerSelect.innerHTML = '<option value="" selected disabled>Нет доступных дублёров</option>';
                    return;
                }
                dublers.forEach(d => {
                    const option = document.createElement('option');
                    option.value = d.name; // имя дублера
                    option.dataset.class = d.class; // класс дублера
                    option.dataset.group = d.group; // группа дублера
                    option.textContent = `${d.name} (${d.class} ${d.group})`;
                    dublerSelect.appendChild(option);
                });
            })
            .catch(error => {
                dublerSelect.innerHTML = '<option value="" selected disabled>Ошибка связи с сервером</option>';
            });
    }

    // отправка жалобы на дублера
    const complaintBtn = document.getElementById('complaintBtn');
    if (complaintBtn) {
        complaintBtn.addEventListener('click', function(e) {
            e.preventDefault();
            const complaintError = document.getElementById('complaintError'); // блок ошибок жалобы

            if (currentToken === 'guest') { // гость не может отправлять жалобы
                if (complaintError) {
                    complaintError.textContent = '❌ Ошибка: вы гость';
                    complaintError.style.color = 'red';
                }
                return;
            }
            const dublerSelectEl = document.getElementById('dublerSelect');
            const reasonVal = document.getElementById('complaintReason').value; // причина
            const selectedOption = dublerSelectEl.options[dublerSelectEl.selectedIndex]; // выбранный option

            if (!dublerSelectEl.value || !reasonVal) { // если чего то нет
                if (complaintError) {
                    complaintError.textContent = '❌ Заполните все поля формы!';
                    complaintError.style.color = 'red';
                }
                return;
            }

            const payload = {
                token: currentToken,
                dubler_name: dublerSelectEl.value,
                dubler_class: selectedOption.dataset.class,
                dubler_group: selectedOption.dataset.group,
                reason: reasonVal
            };

            fetch(`${API_BASE}api/submit_complaint`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            })
            .then(res => res.json())
            .then(data => {
                if (data.error) {
                    if (complaintError) {
                        complaintError.textContent = '❌ Ошибка: ' + data.error;
                        complaintError.style.color = 'red';
                    }
                } else {
                    if (complaintError) {
                        complaintError.textContent = '✅ ' + data.message;
                        complaintError.style.color = 'green';
                    }
                    dublerSelectEl.selectedIndex = 0; // сбрасываем список дублеров на заглушку
                    document.getElementById('complaintReason').value = ''; // очищаем поле причины
                }
            })
            .catch(err => {
                if (complaintError) {
                    complaintError.textContent = '❌ Ошибка при связи с сервером';
                    complaintError.style.color = 'red';
                }
            });
        });
    }

    // гость пытается писать в форму жалобы - сразу показываем ошибку
    const complaintReasonEl = document.getElementById('complaintReason');
    if (complaintReasonEl && currentToken === 'guest') {
        complaintReasonEl.addEventListener('input', () => {
            complaintReasonEl.value = ''; // стираем введённый текст
            const complaintError = document.getElementById('complaintError');
            if (complaintError) {
                complaintError.textContent = '❌ Ошибка: вы гость';
                complaintError.style.color = 'red';
            }
        });
    }

    // ==============================
    // НАЧИСЛЕНИЕ ЗА ДЕЛА И СПИСАНИЕ RENOCOINS (страница dubler)
    // ==============================

    // сбрасывает выбор ученика после успешной отправки
    function resetStudentPicker() {
        classSelect.selectedIndex = 0; // возвращаем класс на заглушку
        dynamicSelect.innerHTML = '<option selected disabled>Сначала выберите класс...</option>';
        dynamicSelect.disabled = true;
        nameSelect.innerHTML = '<option selected disabled>Сначала выберите класс и группу...</option>';
        nameSelect.disabled = true;
    }

    // список дел (сумму за каждое дело определяет сервер)
    const deedSelect = document.getElementById('deedSelect');
    let deedsById = {}; // дела по id (нужны, чтобы знать тип суммы)
    if (deedSelect) {
        deedSelect.addEventListener('change', () => { // для фонда и диапазона показываем поле ввода числа
            const d = deedsById[deedSelect.value];
            const box = document.getElementById('deedValueBox');
            const label = document.getElementById('deedValueLabel');
            const input = document.getElementById('deedValue');
            if (!box || !label || !input || !d) return;
            input.value = '';
            if (d.fund !== undefined) {
                label.textContent = 'Сколько человек делали фильм';
                box.style.display = '';
            } else if (d.min !== undefined) {
                label.textContent = `Сколько renocoins (${d.min}–${d.max})`;
                box.style.display = '';
            } else {
                box.style.display = 'none';
            }
        });

        fetch(`${API_BASE}api/deeds`)
            .then(res => res.json())
            .then(deeds => {
                deedSelect.innerHTML = '<option value="" selected disabled>Выберите дело...</option>';
                deedsById = {};
                const groups = {}; // группы дел (optgroup)
                deeds.forEach(d => {
                    deedsById[d.id] = d;
                    if (!groups[d.group]) {
                        groups[d.group] = document.createElement('optgroup');
                        groups[d.group].label = d.group;
                        deedSelect.appendChild(groups[d.group]);
                    }
                    const option = document.createElement('option');
                    option.value = d.id;
                    let hint;
                    if (d.coins !== undefined) hint = ` (+${d.coins})`;
                    else if (d.fund !== undefined) hint = ` (фонд ${d.fund}, делится на команду)`;
                    else hint = ` (от ${d.min} до ${d.max})`;
                    option.textContent = d.name + hint;
                    groups[d.group].appendChild(option);
                });
            })
            .catch(() => {
                deedSelect.innerHTML = '<option value="" selected disabled>Ошибка связи с сервером</option>';
            });
    }

    // начисление renocoins за дело
    function submitDeed() {
        const coinsError = document.getElementById('coinsError');
        const showErr = (text, ok) => {
            if (!coinsError) return;
            coinsError.textContent = text;
            coinsError.style.color = ok ? 'green' : 'red';
        };

        if (!classSelect.value || !dynamicSelect.value || !nameSelect.value || !deedSelect.value) {
            showErr('❌ Выберите ученика и дело!', false);
            return;
        }

        fetch(`${API_BASE}api/award_deed`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                token: currentToken,
                class: classSelect.value,
                group: dynamicSelect.value,
                name: nameSelect.value,
                deed_id: deedSelect.value,
                value: ((document.getElementById('deedValue') || {}).value) || ''
            })
        })
        .then(res => res.json())
        .then(data => {
            if (data.error) { showErr('❌ Ошибка: ' + data.error, false); return; }
            showErr('✅ ' + data.message, true);
            resetStudentPicker();
            deedSelect.selectedIndex = 0;
            const valueBox = document.getElementById('deedValueBox');
            if (valueBox) valueBox.style.display = 'none';
        })
        .catch(() => showErr('❌ Ошибка при связи с сервером', false));
    }

    // ручное начисление (только админы): сумму и причину админ пишет сам
    function submitCustomAward() {
        const coinsError = document.getElementById('coinsError');
        const showErr = (text, ok) => {
            if (!coinsError) return;
            coinsError.textContent = text;
            coinsError.style.color = ok ? 'green' : 'red';
        };
        const amountVal = document.getElementById('customAmount').value;
        const reasonVal = document.getElementById('customReason').value.trim();

        if (!classSelect.value || !dynamicSelect.value || !nameSelect.value || !amountVal || !reasonVal) {
            showErr('❌ Выберите ученика, укажите сумму и причину!', false);
            return;
        }
        if (!Number.isInteger(Number(amountVal)) || Number(amountVal) <= 0) {
            showErr('❌ Количество renocoins должно быть целым числом больше нуля', false);
            return;
        }

        fetch(`${API_BASE}api/admin/award_custom`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                token: currentToken,
                class: classSelect.value,
                group: dynamicSelect.value,
                name: nameSelect.value,
                amount: amountVal,
                reason: reasonVal
            })
        })
        .then(res => res.json())
        .then(data => {
            if (data.error) { showErr('❌ Ошибка: ' + data.error, false); return; }
            showErr('✅ ' + data.message, true);
            resetStudentPicker();
            document.getElementById('customAmount').value = '';
            document.getElementById('customReason').value = '';
        })
        .catch(() => showErr('❌ Ошибка при связи с сервером', false));
    }

    // списание renocoins (вручную, с причиной)
    function submitTake() {
        const coinsError = document.getElementById('coinsError'); // блок ошибок renocoins
        const showErr = (text, ok) => {
            if (!coinsError) return;
            coinsError.textContent = text;
            coinsError.style.color = ok ? 'green' : 'red';
        };
        const amountVal = document.getElementById('coinsAmount').value; // количество renocoins
        const reasonVal = document.getElementById('coinsReason').value; // причина

        if (!classSelect.value || !dynamicSelect.value || !nameSelect.value || !amountVal || !reasonVal) { // если чего то нет
            showErr('❌ Заполните все поля формы!', false);
            return;
        }

        if (!Number.isInteger(Number(amountVal)) || Number(amountVal) <= 0) { // количество должно быть целым и больше нуля
            showErr('❌ Количество renocoins должно быть целым числом больше нуля', false);
            return;
        }

        fetch(`${API_BASE}api/coins`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                token: currentToken,
                class: classSelect.value,
                group: dynamicSelect.value,
                name: nameSelect.value,
                amount: amountVal,
                reason: reasonVal,
                action: 'списать'
            })
        })
        .then(res => res.json())
        .then(data => {
            if (data.error) { showErr('❌ Ошибка: ' + data.error, false); return; }
            showErr('✅ ' + data.message, true);
            resetStudentPicker();
            document.getElementById('coinsAmount').value = '';
            document.getElementById('coinsReason').value = '';
            const penaltySel = document.getElementById('penaltySelect');
            if (penaltySel) penaltySel.selectedIndex = 0;
        })
        .catch(() => showErr('❌ Ошибка при связи с сервером', false));
    }

    // штрафы: выбор нарушения подставляет сумму и причину в форму списания
    const penaltySelect = document.getElementById('penaltySelect');
    if (penaltySelect) {
        let penalties = [];
        fetch(`${API_BASE}api/penalties`)
            .then(res => res.json())
            .then(list => {
                penalties = list;
                penaltySelect.innerHTML = '<option value="" selected disabled>Выберите нарушение (или впишите вручную ниже)...</option>';
                list.forEach((p, i) => {
                    const option = document.createElement('option');
                    option.value = i;
                    option.textContent = `${p.name} (−${p.amount})`;
                    penaltySelect.appendChild(option);
                });
            })
            .catch(() => {
                penaltySelect.innerHTML = '<option value="" selected disabled>Ошибка связи с сервером</option>';
            });
        penaltySelect.addEventListener('change', () => {
            const p = penalties[penaltySelect.value];
            if (!p) return;
            document.getElementById('coinsAmount').value = p.amount;
            document.getElementById('coinsReason').value = 'Штраф: ' + p.name;
        });
    }

    const giveCoinsBtn = document.getElementById('giveCoinsBtn'); // кнопка начисления за дело
    if (giveCoinsBtn) {
        giveCoinsBtn.addEventListener('click', function(e) {
            e.preventDefault();
            submitDeed();
        });
    }

    const customAwardBtn = document.getElementById('customAwardBtn'); // кнопка ручного начисления (админы)
    if (customAwardBtn) {
        customAwardBtn.addEventListener('click', function(e) {
            e.preventDefault();
            submitCustomAward();
        });
    }

    const takeCoinsBtn = document.getElementById('takeCoinsBtn'); // кнопка списания renocoins
    if (takeCoinsBtn) {
        takeCoinsBtn.addEventListener('click', function(e) {
            e.preventDefault();
            submitTake();
        });
    }

    // ==============================
    // СМЕНА ПАРОЛЯ (страница profil)
    // ==============================
    const changePasswordBtn = document.getElementById('changePasswordBtn'); // кнопка смены пароля
    if (changePasswordBtn) {
        changePasswordBtn.addEventListener('click', function(e) {
            e.preventDefault();
            const msg = document.getElementById('passwordChangeMsg'); // блок сообщений
            const showMsg = (text, ok) => { // вывод сообщения нужным цветом
                msg.textContent = text;
                msg.style.color = ok ? 'green' : 'red';
            };

            if (!currentToken || currentToken === 'guest') { // гость не может менять пароль
                showMsg('❌ Войдите в аккаунт, чтобы сменить пароль', false);
                return;
            }

            const oldVal = document.getElementById('oldPassword').value; // текущий пароль
            const newVal = document.getElementById('newPassword').value; // новый пароль
            const confirmVal = document.getElementById('confirmPassword').value; // повтор нового пароля

            if (!oldVal || !newVal || !confirmVal) { // если чего то нет
                showMsg('❌ Заполните все поля формы!', false);
                return;
            }
            if (newVal !== confirmVal) { // новые пароли должны совпадать
                showMsg('❌ Новые пароли не совпадают', false);
                return;
            }
            if (newVal.length < 6) { // минимальная длина
                showMsg('❌ Новый пароль должен быть не короче 6 символов', false);
                return;
            }

            fetch(`${API_BASE}api/change_password`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    token: currentToken,
                    old_password: oldVal,
                    new_password: newVal,
                    confirm_password: confirmVal
                })
            })
            .then(res => res.json())
            .then(data => {
                if (data.error) {
                    showMsg('❌ ' + data.error, false);
                } else {
                    showMsg('✅ ' + data.message, true);
                    document.getElementById('oldPassword').value = ''; // очищаем поля после успеха
                    document.getElementById('newPassword').value = '';
                    document.getElementById('confirmPassword').value = '';
                }
            })
            .catch(() => showMsg('❌ Ошибка при связи с сервером', false));
        });
    }

    // ==============================
    // АДМИН ПАНЕЛЬ
    // ==============================
    // рисует таблицу в блок (всё через textContent)
    function renderAdminTable(box, headers, rows, emptyText) {
        box.innerHTML = '';
        if (rows.length === 0) { setMessage(box, emptyText); return; }
        const wrap = document.createElement('div');
        wrap.className = 'table-responsive';
        wrap.style.maxHeight = '500px'; // длинные логи прокручиваются
        wrap.style.overflowY = 'auto';
        const table = document.createElement('table');
        table.className = 'table table-sm table-striped align-middle';
        const thead = document.createElement('thead');
        const hr = document.createElement('tr');
        headers.forEach(h => {
            const th = document.createElement('th');
            th.textContent = h;
            hr.appendChild(th);
        });
        thead.appendChild(hr);
        table.appendChild(thead);
        const tbody = document.createElement('tbody');
        rows.forEach(values => {
            const tr = document.createElement('tr');
            values.forEach(v => {
                const td = document.createElement('td');
                td.textContent = v;
                tr.appendChild(td);
            });
            tbody.appendChild(tr);
        });
        table.appendChild(tbody);
        wrap.appendChild(table);
        box.appendChild(wrap);
    }

    // загружает один раздел админки
    function loadAdminSection(boxId, endpoint, headers, toRow, emptyText) {
        const box = document.getElementById(boxId);
        if (!box) return;
        fetch(`${API_BASE}api/admin/${endpoint}?token=${encodeURIComponent(currentToken)}`)
            .then(res => res.json())
            .then(data => {
                if (data.error) { setMessage(box, 'Ошибка: ' + data.error); return; }
                renderAdminTable(box, headers, data.map(toRow), emptyText);
            })
            .catch(() => setMessage(box, 'Ошибка связи с сервером.'));
    }

    // таблица дублёров с выбором строки кликом
    let selectedDubler = null;

    function loadAdminDublers() {
        const box = document.getElementById('admin-dublers');
        if (!box) return;
        fetch(`${API_BASE}api/admin/dublers?token=${encodeURIComponent(currentToken)}`)
            .then(res => res.json())
            .then(data => {
                if (data.error) { setMessage(box, 'Ошибка: ' + data.error); return; }
                renderAdminTable(box, ['Дублёр', 'Класс', 'Группа', 'Renocoins', 'Соцрейтинг'],
                    data.map(d => [d.name, d.class, d.group, d.coins, d.rating]), 'Дублёров нет.');
                box.querySelectorAll('tbody tr').forEach((tr, i) => {
                    tr.style.cursor = 'pointer';
                    if (data[i].name === selectedDubler) tr.classList.add('table-active');
                    tr.addEventListener('click', () => {
                        selectedDubler = data[i].name;
                        document.getElementById('ratingSelected').textContent = data[i].name;
                        box.querySelectorAll('tbody tr').forEach(r => r.classList.remove('table-active'));
                        tr.classList.add('table-active');
                    });
                });
            })
            .catch(() => setMessage(box, 'Ошибка связи с сервером.'));
    }

    // начислить (sign = 1) или снять (sign = -1) соцрейтинг
    function changeRating(sign) {
        const msg = document.getElementById('ratingMsg');
        const show = (text, ok) => { msg.textContent = text; msg.style.color = ok ? 'green' : 'red'; };
        const amount = Number(document.getElementById('ratingAmount').value);
        const reason = document.getElementById('ratingReason').value.trim();

        if (!selectedDubler) { show('❌ Выберите дублёра в таблице', false); return; }
        if (!Number.isInteger(amount) || amount <= 0) { show('❌ Количество должно быть целым числом больше нуля', false); return; }
        if (!reason) { show('❌ Укажите причину', false); return; }

        fetch(`${API_BASE}api/admin/rating`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token: currentToken, name: selectedDubler, delta: sign * amount, reason: reason })
        })
        .then(res => res.json())
        .then(data => {
            if (data.error) { show('❌ ' + data.error, false); return; }
            show(`✅ Готово. Соцрейтинг дублёра теперь ${data.rating}`, true);
            document.getElementById('ratingAmount').value = '';
            document.getElementById('ratingReason').value = '';
            loadAdminData(); // обновляем таблицы
        })
        .catch(() => show('❌ Ошибка при связи с сервером', false));
    }

    const ratingAddBtn = document.getElementById('ratingAddBtn');
    if (ratingAddBtn) ratingAddBtn.addEventListener('click', () => changeRating(1));
    const ratingSubBtn = document.getElementById('ratingSubBtn');
    if (ratingSubBtn) ratingSubBtn.addEventListener('click', () => changeRating(-1));

    function loadAdminData() {
        loadAdminDublers();

        loadAdminSection('coin-logs', 'coin_logs',
            ['Дата', 'Кто', 'Кому', 'Класс', 'Действие', 'Сумма', 'Причина'],
            l => [l.timestamp, l.giver_name, l.receiver_name, `${l.receiver_class} ${l.receiver_group}`,
                  l.action, l.amount, l.reason],
            'Логов renocoins пока нет.');

        loadAdminSection('purchases-log', 'purchases',
            ['Дата', 'Покупатель', 'Товар', 'Цена'],
            p => [p.timestamp, p.buyer_name, p.product_name, p.price],
            'Покупок пока нет.');

        loadAdminSection('complaints-log', 'complaints',
            ['Дата', 'Кто пожаловался', 'Класс', 'На кого', 'Класс', 'Причина'],
            c => [c.timestamp, c.complainant_name, `${c.complainant_class} ${c.complainant_group}`,
                  c.dubler_name, `${c.dubler_class} ${c.dubler_group}`, c.reason],
            'Жалоб пока нет.');

        loadAdminSection('rating-logs', 'rating_logs',
            ['Дата', 'Админ', 'Дублёр', 'Изменение', 'Причина'],
            r => [r.timestamp, r.admin_name, r.dubler_name, (r.delta > 0 ? '+' : '') + r.delta, r.reason],
            'Изменений пока нет.');
    }

    // ==============================
    // МАГАЗИН
    // ==============================

    // загрузка баланса renocoins в магазине
    async function updateShopBalance() {
        const shopBalance = document.getElementById('shopBalance'); // баланс в магазине
        if (!shopBalance || !currentToken) return; // если мы не на странице магазина или нет токена - стоп

        if (currentToken === 'guest') { // для гостя баланс всегда 0
            shopBalance.textContent = '0';
            return;
        }

        try {
            const response = await fetch(`${API_BASE}api/verify_user?token=${encodeURIComponent(currentToken)}`); // актуальный профиль
            const data = await response.json();
            if (data.exists && data.coins !== undefined) { // если пользователь найден
                shopBalance.textContent = data.coins;
            }
        } catch (error) {
            shopBalance.textContent = '0'; // при ошибке оставляем понятное значение
        }
    }

    // создаёт элемент с классом и текстом
    function shopEl(tag, className, text) {
        const node = document.createElement(tag);
        if (className) node.className = className;
        if (text !== undefined) node.textContent = text;
        return node;
    }

    // карточка одного товара (название, картинка, цена и остаток приходят с сервера)
    function makeShopCard(item) {
        const col = shopEl('div', 'col-12 col-md-6 col-lg-4');
        const card = shopEl('div', 'shop-card');

        const imgBox = shopEl('div', 'shop-card-image');
        const img = document.createElement('img');
        img.src = item.image;
        img.alt = item.name;
        imgBox.appendChild(img);

        const content = shopEl('div', 'shop-card-content');
        content.appendChild(shopEl('h3', '', item.name));
        content.appendChild(shopEl('p', '', item.desc));

        const stock = shopEl('div', 'shop-stock');
        stock.appendChild(shopEl('i', 'fa-solid fa-box'));
        stock.appendChild(document.createTextNode(' Осталось: '));
        stock.appendChild(shopEl('span', 'shop-stock-count', String(item.left)));
        stock.appendChild(document.createTextNode(' шт.'));
        content.appendChild(stock);

        const price = shopEl('div', 'shop-card-price');
        price.appendChild(shopEl('i', 'fa-solid fa-coins'));
        price.appendChild(document.createTextNode(' '));
        price.appendChild(shopEl('span', '', (item.price === null || item.price === undefined) ? '?' : String(item.price)));
        price.appendChild(document.createTextNode(' renocoins.'));
        content.appendChild(price);

        const btn = shopEl('button', 'shop-buy-btn');
        const btnIcon = shopEl('i', 'fa-solid fa-cart-shopping');
        btn.appendChild(btnIcon);
        if (item.left <= 0) { // товар закончился
            btn.disabled = true;
            btnIcon.className = 'fa-solid fa-ban';
            btn.appendChild(document.createTextNode(' Нет в наличии'));
        } else if (!item.open) { // цены ещё нет, покупки закрыты
            btn.disabled = true;
            btnIcon.className = 'fa-solid fa-lock';
            btn.appendChild(document.createTextNode(' Скоро в продаже'));
        } else {
            btn.appendChild(document.createTextNode(' Купить'));
            btn.addEventListener('click', () => buyProduct(item.name));
        }
        content.appendChild(btn);

        card.appendChild(imgBox);
        card.appendChild(content);
        col.appendChild(card);
        return col;
    }

    // загрузка и отрисовка товаров магазина
    async function loadShop() {
        const grid = document.getElementById('shopGrid'); // сетка товаров
        if (!grid) return; // если мы не на странице магазина - стоп

        try {
            const response = await fetch(`${API_BASE}api/shop`); // товары с сервера
            const items = await response.json();

            grid.innerHTML = '';
            items.forEach(item => grid.appendChild(makeShopCard(item)));

            const message = document.getElementById('shopMessage');
            if (message && !message.textContent && !items.some(i => i.open)) {
                message.textContent = 'Цены пока неизвестны, покупки откроются позже.';
            }
        } catch (error) {
            grid.textContent = 'Не удалось загрузить товары.';
        }
    }

    // покупка товара
    async function buyProduct(productName) {
        const message = document.getElementById('shopMessage'); // блок сообщений магазина

        if (!currentToken || currentToken === 'guest') { // без авторизации покупать нельзя
            if (message) message.textContent = '❌ Войдите в аккаунт, чтобы совершить покупку.';
            return;
        }

        try {
            const response = await fetch(`${API_BASE}api/buy`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token: currentToken, product_name: productName })
            });
            const data = await response.json();

            if (data.error) { // если сервер вернул ошибку
                if (message) message.textContent = '❌ ' + data.error;
                return;
            }

            if (message) message.textContent = '✅ Покупка успешно совершена!';
            const shopBalance = document.getElementById('shopBalance'); // баланс в магазине
            const coinsSpan = document.getElementById('coins'); // баланс в профиле, если он есть
            if (shopBalance && data.coins !== undefined) shopBalance.textContent = data.coins;
            if (coinsSpan && data.coins !== undefined) coinsSpan.textContent = data.coins;

            await loadShop(); // обновляем остатки товаров
            await loadPurchases(); // обновляем покупки в профиле, если блок есть
            await loadCoinLogs(); // обновляем историю renocoins, если блок есть
        } catch (error) {
            if (message) message.textContent = '❌ Ошибка при связи с сервером';
        }
    }

    // загрузка покупок в профиль
    async function loadPurchases() {
        const block = document.getElementById('purchasedProducts'); // блок купленных товаров
        if (!block) return; // если это не профиль - стоп
        if (!currentToken || currentToken === 'guest') { // для гостя список пуст
            block.textContent = 'Вы ещё ничего не покупали';
            return;
        }

        try {
            const response = await fetch(`${API_BASE}api/get_purchases?token=${encodeURIComponent(currentToken)}`); // история покупок
            const purchases = await response.json();

            if (!Array.isArray(purchases) || purchases.length === 0) { // если покупок нет
                block.textContent = 'Вы ещё ничего не покупали';
                return;
            }

            block.innerHTML = purchases.map(p => `
                <div class="purchase-item" style="display:flex; flex-direction:column; align-items:flex-start; gap:4px; width:100%; box-sizing:border-box;">
                    <div style="width:100%; overflow-wrap:anywhere;">
                        <i class="fa-solid fa-gift"></i> ${p.product_name}
                    </div>
                    <small>Цена: ${p.price} 🪙</small>
                    <small>Дата покупки: ${p.timestamp}</small>
                </div>
            `).join(''); // названия товаров приходят с сервера из фиксированного списка, не от пользователей
        } catch (error) {
            block.textContent = 'Ошибка загрузки покупок';
        }
    }

    // повторная загрузка истории renocoins после покупки
    async function loadCoinLogs() {
        const coinLogsBox = document.getElementById('coinLogs'); // блок истории renocoins
        if (!coinLogsBox || !currentToken || currentToken === 'guest') return; // если блока нет - стоп

        try {
            const response = await fetch(`${API_BASE}api/get_coin_logs?token=${encodeURIComponent(currentToken)}`);
            const logs = await response.json();
            if (!Array.isArray(logs)) return; // защита от неверного ответа
            if (logs.length === 0) {
                setMessage(coinLogsBox, 'Пока что записей нет.');
                return;
            }
            renderCoinLogs(coinLogsBox, logs, userStatus === 'дублёр'); // рисуем историю
        } catch (error) {
            setMessage(coinLogsBox, 'Ошибка загрузки логов.');
        }
    }

    // ==============================
    // ТОП УЧЕНИКОВ И ГРУПП (главная страница) с переключением кнопками
    // ==============================
    const topHead = document.getElementById('topHead');
    const topBody = document.getElementById('topBody');
    const topButtons = document.querySelectorAll('.top-btn');
    let topData = null; // данные с сервера, чтобы не грузить заново при переключении
    let activeTop = 'groups:rvg'; // что показываем сейчас

    function topMessage(text, colspan) { // одна строка с сообщением
        topBody.innerHTML = '';
        const tr = document.createElement('tr');
        const td = document.createElement('td');
        td.colSpan = colspan;
        td.textContent = text;
        tr.appendChild(td);
        topBody.appendChild(tr);
    }

    function renderTop() { // рисует таблицу для выбранной кнопки
        if (!topHead || !topBody) return;
        const [kind, cat] = activeTop.split(':'); // 'groups:rvg' -> kind='groups', cat='rvg'
        const headers = kind === 'groups' ? ['Место', 'Группа', 'Renocoins'] : ['Место', 'Ученик', 'Класс', 'Группа', 'Renocoins'];

        topHead.innerHTML = '';
        const headRow = document.createElement('tr');
        headers.forEach(h => {
            const th = document.createElement('th');
            th.textContent = h;
            headRow.appendChild(th);
        });
        topHead.appendChild(headRow);

        if (!topData) { topMessage('Загрузка...', headers.length); return; }
        if (topData.error) { topMessage('Ошибка загрузки топа', headers.length); return; }

        const rows = topData[kind][cat] || [];
        if (rows.length === 0) { topMessage('Пока никто не заработал renocoins', headers.length); return; }

        topBody.innerHTML = '';
        rows.forEach(r => {
            const values = kind === 'groups' ? [r.place, r.group, r.coins] : [r.place, r.name, r.class, r.group, r.coins];
            const tr = document.createElement('tr');
            values.forEach(v => {
                const td = document.createElement('td');
                td.textContent = v; // textContent, чтобы имена не вставлялись как html
                tr.appendChild(td);
            });
            topBody.appendChild(tr);
        });
    }

    topButtons.forEach(btn => {
        btn.addEventListener('click', () => { // переключение топа
            activeTop = btn.dataset.top;
            topButtons.forEach(b => b.classList.toggle('active', b === btn));
            renderTop();
        });
    });

    async function loadTop() {
        if (!topHead || !topBody) return; // если это не главная - стоп
        renderTop(); // сначала показываем "Загрузка..."
        try {
            const response = await fetch(`${API_BASE}api/top`);
            topData = await response.json();
        } catch (error) {
            topData = { error: true };
        }
        renderTop();
    }

    updateShopBalance(); // запускаем загрузку баланса магазина
    loadTop(); // запускаем загрузку топов главной
    loadShop(); // запускаем загрузку магазина
    loadPurchases(); // запускаем загрузку покупок профиля

});

// страница "О нас": клик по карточке открывает окно с текстом
document.addEventListener('DOMContentLoaded', () => {
    const modalEl = document.getElementById('aboutModal'); // окно
    if (!modalEl) return; // если это не страница "О нас" - стоп
    const modal = bootstrap.Modal.getOrCreateInstance(modalEl); // bootstrap-окно

    function openCard(card) {
        document.getElementById('aboutModalName').textContent = card.dataset.name; // имя
        document.getElementById('aboutModalRole').textContent = card.dataset.role; // должность
        document.getElementById('aboutModalText').innerHTML = card.querySelector('.about-card-text').innerHTML; // текст из карточки
        modal.show(); // открываем
    }

    document.querySelectorAll('.about-card').forEach(card => {
        card.addEventListener('click', () => openCard(card)); // нажатие мышью
        card.addEventListener('keydown', (e) => { // нажатие Enter или пробела с клавиатуры
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                openCard(card);
            }
        });
    });
});