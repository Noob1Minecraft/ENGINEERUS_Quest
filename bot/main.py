import os
import asyncio
import httpx
import json
from aiogram import Bot, Dispatcher, types
from aiogram.filters import Command
from aiogram.fsm.context import FSMContext
from aiogram.fsm.state import StatesGroup, State
from dotenv import load_dotenv

from daily_quest import router as daily_quest_router

load_dotenv()
bot = Bot(token=os.getenv("BOT_TOKEN"))
dp = Dispatcher()
API_URL = os.getenv("API_URL", "http://127.0.0.1:8000")

dp.include_router(daily_quest_router)

# === БЛОКИРОВКА ОДНОВРЕМЕННЫХ ЗАПРОСОВ ===
# Хранит ID пользователей, которые сейчас ждут ответа от AI
processing_users = set()

TEXTS = {
    "ru": {
        "choose_lang": "Привет! Выбери язык:",
        "lang_set": "Отлично! Теперь я буду отвечать на русском.\n\nИспользуй /lang чтобы сменить язык.",
        "welcome": "Привет! Выбери модуль:",
        "ask_question": "Отправь вопрос для модуля",
        "limit_msg": "Лимит: 10 запросов/день. Подключи Premium ($5/мес).",
        "error": "Ошибка. Попробуй через минуту.",
        "busy": " Подожди, я ещё думаю над предыдущим вопросом...\nПопробуй через минуту.",
        "current_lang": "Текущий язык: Русский\n\nВыбери новый:",
        "lang_changed": "Язык изменён на русский!",
        "no_achievements": "У тебя пока нет ачивок. Начни использовать модули!",
        "achievements_header": "Твои ачивки:\n\n",
        "thinking": "Думаю...",
        "help": (
            "Команды бота:\n\n"
            "/start - начать заново\n"
            "/lang - сменить язык\n"
            "/profile - твой профиль\n"
            "/stats - расширенная статистика\n"
            "/achievements - ачивки\n"
            "/daily - ежедневный квест\n"
            "/check_daily - проверить квест\n"
            "/streak - твоя серия\n"
            "/bind - привязать веб-аккаунт\n"
            "/whoami - статус привязки\n"
            "/help - помощь"
        ),
        "bind_usage": "Привязка веб-аккаунта\n\nИспользуй:\n/bind email пароль\n\nПример:\n/bind user@example.com mypassword123",
        "bind_success": "Аккаунт привязан! Теперь твой прогресс синхронизируется с сайтом.",
        "bind_error": "Ошибка привязки. Проверь email и пароль.",
        "bind_already": "Ты уже привязан к аккаунту: {email}",
        "whoami_bound": "Ты привязан к аккаунту: {email}\n\nПрогресс синхронизирован с сайтом.",
        "whoami_not_bound": "Ты не привязан к веб-аккаунту.\n\nИспользуй /bind для привязки.",
        "unbind_success": "Привязка удалена.",
        "unbind_not_bound": "Ты не привязан к аккаунту."
    },
    "kk": {
        "choose_lang": "Сәлем! Тілді таңда:",
        "lang_set": "Керемет! Енді қазақша жауап беремін.\n\nТілді өзгерту үшін /lang пайдалан.",
        "welcome": "Сәлем! Модульді таңда:",
        "ask_question": "Модульге сұрақ жібер",
        "limit_msg": "Лимит: 10 сұрау/күн. Premium қос ($5/ай).",
        "error": "Қате. Бір минуттан кейін қайтала.",
        "busy": " Күте тұр, мен алдыңғы сұраққа жауап беріп жатырмын...\nБір минуттан кейін қайтала.",
        "current_lang": "Ағымдағы тіл: Қазақша\n\nЖаңа тілді таңда:",
        "lang_changed": "Тіл қазақшаға өзгертілді!",
        "no_achievements": "Жетістіктер жоқ. Модульдерді қолдана баста!",
        "achievements_header": "Сенің жетістіктерің:\n\n",
        "thinking": "Ойлануда...",
        "help": (
            "Бот пәрмендері:\n\n"
            "/start - қайта бастау\n"
            "/lang - тілді өзгерту\n"
            "/profile - профилің\n"
            "/stats - толық статистика\n"
            "/achievements - жетістіктер\n"
            "/daily - күнделікті квест\n"
            "/check_daily - квестті тексеру\n"
            "/streak - серияң\n"
            "/bind - веб-аккаунтты байланыстыру\n"
            "/whoami - байланыс күйі\n"
            "/help - көмек"
        ),
        "bind_usage": "Веб-аккаунтты байланыстыру\n\nПайдалан:\n/bind email пароль\n\nМысал:\n/bind user@example.com mypassword123",
        "bind_success": "Аккаунт байланыстырылды! Енді прогрессің сайтпен синхрондалады.",
        "bind_error": "Байланыстыру қатесі. Email мен парольді тексер.",
        "bind_already": "Сен аккаунтқа байланыстырылған: {email}",
        "whoami_bound": "Сен аккаунтқа байланыстырылған: {email}\n\nПрогресс сайтпен синхрондалған.",
        "whoami_not_bound": "Сен веб-аккаунтқа байланыстырылмаған.\n\nБайланыстыру үшін /bind пайдалан.",
        "unbind_success": "Байланыс жойылды.",
        "unbind_not_bound": "Сен аккаунтқа байланыстырылмаған."
    },
    "en": {
        "choose_lang": "Hello! Select language:",
        "lang_set": "Great! Now I'll answer in English.\n\nUse /lang to change language.",
        "welcome": "Hello! Choose a module:",
        "ask_question": "Send a question for the module",
        "limit_msg": "Limit: 10 requests/day. Get Premium ($5/mo).",
        "error": "Error. Try again in a minute.",
        "busy": " Wait, I'm still thinking about the previous question...\nTry again in a minute.",
        "current_lang": "Current language: English\n\nChoose new:",
        "lang_changed": "Language changed to English!",
        "no_achievements": "No achievements yet. Start using modules!",
        "achievements_header": "Your achievements:\n\n",
        "thinking": "Thinking...",
        "help": (
            "Bot commands:\n\n"
            "/start - restart\n"
            "/lang - change language\n"
            "/profile - your profile\n"
            "/stats - detailed statistics\n"
            "/achievements - achievements\n"
            "/daily - daily quest\n"
            "/check_daily - check quest\n"
            "/streak - your streak\n"
            "/bind - link web account\n"
            "/whoami - link status\n"
            "/help - help"
        ),
        "bind_usage": "Link web account\n\nUse:\n/bind email password\n\nExample:\n/bind user@example.com mypassword123",
        "bind_success": "Account linked! Your progress now syncs with the website.",
        "bind_error": "Link error. Check email and password.",
        "bind_already": "You're already linked to: {email}",
        "whoami_bound": "You're linked to: {email}\n\nProgress synced with website.",
        "whoami_not_bound": "You're not linked to a web account.\n\nUse /bind to link.",
        "unbind_success": "Link removed.",
        "unbind_not_bound": "You're not linked to an account."
    }
}

user_langs_cache = {}


async def get_user_lang(tg_id: int) -> str:
    if tg_id in user_langs_cache:
        return user_langs_cache[tg_id]
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.get(f"{API_URL}/api/user/lang/{tg_id}", timeout=5.0)
            if resp.status_code == 200:
                lang = resp.json().get("lang", "ru")
                user_langs_cache[tg_id] = lang
                return lang
    except Exception:
        pass
    return "ru"


async def set_user_lang(tg_id: int, lang: str):
    user_langs_cache[tg_id] = lang
    try:
        async with httpx.AsyncClient() as client:
            await client.post(
                f"{API_URL}/api/user/lang",
                json={"telegram_id": tg_id, "lang": lang},
                timeout=5.0
            )
    except Exception:
        pass


class ModuleState(StatesGroup):
    waiting_input = State()


@dp.message(Command("start"))
async def cmd_start(message: types.Message, state: FSMContext):
    await state.clear()
    kb = types.InlineKeyboardMarkup(inline_keyboard=[
        [types.InlineKeyboardButton(text="Русский", callback_data="start_lang:ru")],
        [types.InlineKeyboardButton(text="Қазақша", callback_data="start_lang:kk")],
        [types.InlineKeyboardButton(text="English", callback_data="start_lang:en")]
    ])
    await message.answer(TEXTS["ru"]["choose_lang"], reply_markup=kb)


@dp.callback_query(lambda c: c.data.startswith("start_lang:"))
async def start_lang_callback(callback: types.CallbackQuery):
    lang = callback.data.split(":")[1]
    await set_user_lang(callback.from_user.id, lang)
    await callback.message.edit_text(TEXTS[lang]["lang_set"])
    await asyncio.sleep(1.5)

    kb = types.InlineKeyboardMarkup(inline_keyboard=[
        [types.InlineKeyboardButton(text="TUTOR AI", callback_data="mod:tutor")],
        [types.InlineKeyboardButton(text="MaterialSwap", callback_data="mod:material")],
        [types.InlineKeyboardButton(text="PatentCraft", callback_data="mod:patent")],
        [types.InlineKeyboardButton(text="EngiLegal", callback_data="mod:legal")],
        [types.InlineKeyboardButton(text="EngiMatch", callback_data="mod:match")]
    ])
    await callback.message.answer(TEXTS[lang]["welcome"], reply_markup=kb)
    await callback.answer()


@dp.message(Command("lang"))
async def cmd_lang(message: types.Message):
    kb = types.InlineKeyboardMarkup(inline_keyboard=[
        [types.InlineKeyboardButton(text="Русский", callback_data="lang:ru")],
        [types.InlineKeyboardButton(text="Қазақша", callback_data="lang:kk")],
        [types.InlineKeyboardButton(text="English", callback_data="lang:en")]
    ])
    lang = await get_user_lang(message.from_user.id)
    await message.answer(TEXTS[lang]["current_lang"], reply_markup=kb)


@dp.callback_query(lambda c: c.data.startswith("lang:"))
async def lang_callback(callback: types.CallbackQuery):
    new_lang = callback.data.split(":")[1]
    await set_user_lang(callback.from_user.id, new_lang)
    await callback.message.edit_text(TEXTS[new_lang]["lang_changed"])
    await callback.answer()


@dp.callback_query(lambda c: c.data.startswith("mod:"))
async def select_module(callback: types.CallbackQuery, state: FSMContext):
    module = callback.data.split(":")[1]
    lang = await get_user_lang(callback.from_user.id)
    await state.update_data(module=module)
    await callback.message.answer(f"{TEXTS[lang]['ask_question']} {module.upper()}:")
    await callback.answer()
    await state.set_state(ModuleState.waiting_input)


@dp.message(ModuleState.waiting_input)
async def process_query(message: types.Message, state: FSMContext):
    """Обработка вопроса пользователя с защитой от одновременных запросов"""
    user_id = message.from_user.id
    
    # === ЗАЩИТА: если пользователь уже ждёт ответ ===
    if user_id in processing_users:
        lang = await get_user_lang(user_id)
        await message.answer(TEXTS[lang]["busy"])
        return
    
    # Добавляем в список обрабатываемых
    processing_users.add(user_id)
    
    data = await state.get_data()
    module = data.get("module", "tutor")
    lang = await get_user_lang(user_id)

    await message.answer(TEXTS[lang]["thinking"])

    try:
        async with httpx.AsyncClient() as client:
            if module == "tutor":
                endpoint = f"{API_URL}/api/ai"
                payload = {
                    "telegram_id": user_id,
                    "username": message.from_user.username or "",
                    "text": message.text,
                    "lang": lang
                }
            else:
                endpoint = f"{API_URL}/api/module"
                payload = {
                    "telegram_id": user_id,
                    "username": message.from_user.username or "",
                    "module": module,
                    "text": message.text,
                    "lang": lang
                }

            resp = await client.post(endpoint, json=payload, timeout=180.0)
            res = resp.json()

        if res.get("status") == "limit":
            await message.answer(TEXTS[lang]["limit_msg"])
        else:
            text = f"{res['response']}\n\n+XP | Lvl {res['level']}"

            if res.get("streak"):
                streak_word = {"ru": "дн.", "kk": "күн", "en": "days"}[lang]
                text += f" | {res['streak']} {streak_word}"

            if res.get("new_achievements"):
                ach_header = {
                    "ru": "Новые ачивки:",
                    "kk": "Жаңа жетістіктер:",
                    "en": "New achievements:"
                }[lang]
                text += f"\n\n{ach_header}\n"
                for ach in res["new_achievements"]:
                    text += f"  - {ach['name']} (+{ach['xp']} XP)\n"

            await message.answer(text)
    except Exception as e:
        await message.answer(f"{TEXTS[lang]['error']}: {str(e)}")
    finally:
        # === ВАЖНО: всегда убираем пользователя из списка ===
        processing_users.discard(user_id)
        await state.clear()


@dp.message(Command("profile"))
async def cmd_profile(message: types.Message):
    lang = await get_user_lang(message.from_user.id)
    try:
        async with httpx.AsyncClient() as client:
            user_resp = await client.get(f"{API_URL}/api/user/{message.from_user.id}")
            ach_resp = await client.get(f"{API_URL}/api/achievements/{message.from_user.id}")
            user = user_resp.json()
            ach = ach_resp.json()

        labels = {
            "ru": {"level": "Уровень", "streak": "Стрик", "days": "дн.",
                   "requests": "Запросов сегодня", "ach": "Ачивок"},
            "kk": {"level": "Деңгей", "streak": "Стрик", "days": "күн",
                   "requests": "Бүгінгі сұраулар", "ach": "Жетістіктер"},
            "en": {"level": "Level", "streak": "Streak", "days": "days",
                   "requests": "Requests today", "ach": "Achievements"}
        }
        L = labels[lang]
        prem = {"ru": "Да" if user['is_premium'] else "Нет",
                "kk": "Иә" if user['is_premium'] else "Жоқ",
                "en": "Yes" if user['is_premium'] else "No"}[lang]

        text = (
            f"{message.from_user.username or 'Инженер'}\n"
            f"XP: {user['xp']} | {L['level']}: {user['level']}\n"
            f"{L['streak']}: {user.get('streak', 0)} {L['days']}\n"
            f"Premium: {prem}\n"
            f"{L['requests']}: {user['daily_requests']}/10\n"
            f"{L['ach']}: {ach['total']}"
        )

        if user.get("email"):
            text += f"\nEmail: {user['email']}"

        await message.answer(text)
    except Exception as e:
        await message.answer(f"Error: {str(e)}")


@dp.message(Command("stats"))
async def cmd_stats(message: types.Message):
    """Расширенная статистика пользователя"""
    lang = await get_user_lang(message.from_user.id)
    tg_id = message.from_user.id
    
    try:
        async with httpx.AsyncClient() as client:
            user_resp = await client.get(f"{API_URL}/api/user/{tg_id}")
            quests_resp = await client.get(f"{API_URL}/api/quests/completed/{tg_id}")
            ach_resp = await client.get(f"{API_URL}/api/achievements/{tg_id}")
            
            user = user_resp.json()
            quests = quests_resp.json()
            ach = ach_resp.json()
        
        labels = {
            "ru": {
                "title": " Твоя статистика",
                "xp": "Очки опыта", "level": "Уровень",
                "streak": "Текущий стрик", "days": "дн.",
                "quests_done": "Квестов выполнено",
                "total_requests": "Всего запросов к ИИ",
                "material_count": "Подборов материалов",
                "patent_count": "Патентных заявок",
                "achievements": "Получено ачивок",
                "premium": "Премиум", "yes": "Да", "no": "Нет",
                "modules_used": "Использовано модулей",
                "member_since": "В системе с"
            },
            "kk": {
                "title": " Сенің статистикаң",
                "xp": "Тәжірибе ұпайлары", "level": "Деңгей",
                "streak": "Ағымдағы стрик", "days": "күн",
                "quests_done": "Орындалған квесттер",
                "total_requests": "ЖИ-ге жалпы сұраулар",
                "material_count": "Материалдарды таңдау",
                "patent_count": "Патенттік өтінімдер",
                "achievements": "Алынған жетістіктер",
                "premium": "Премиум", "yes": "Иә", "no": "Жоқ",
                "modules_used": "Қолданылған модульдер",
                "member_since": "Жүйеде"
            },
            "en": {
                "title": " Your Statistics",
                "xp": "Experience Points", "level": "Level",
                "streak": "Current Streak", "days": "days",
                "quests_done": "Quests Completed",
                "total_requests": "Total AI Requests",
                "material_count": "Material Selections",
                "patent_count": "Patent Applications",
                "achievements": "Achievements Earned",
                "premium": "Premium", "yes": "Yes", "no": "No",
                "modules_used": "Modules Used",
                "member_since": "Member Since"
            }
        }
        L = labels[lang]
        
        modules_raw = user.get("modules_used", "[]")
        if isinstance(modules_raw, str):
            try:
                modules_list = json.loads(modules_raw)
            except:
                modules_list = []
        else:
            modules_list = modules_raw if isinstance(modules_raw, list) else []
        
        text = f"*{L['title']}*\n\n"
        text += f" *{L['xp']}:* {user.get('xp', 0)}\n"
        text += f" *{L['level']}:* {user.get('level', 1)}\n"
        text += f" *{L['streak']}:* {user.get('streak', 0)} {L['days']}\n\n"
        
        text += f" *{L['quests_done']}:* {len(quests.get('completed', []))}\n"
        text += f" *{L['total_requests']}:* {user.get('requests_count', 0)}\n"
        text += f" *{L['material_count']}:* {user.get('material_count', 0)}\n"
        text += f" *{L['patent_count']}:* {user.get('patent_count', 0)}\n\n"
        
        text += f" *{L['achievements']}:* {ach.get('total', 0)}\n"
        text += f" *{L['premium']}:* {L['yes'] if user.get('is_premium') else L['no']}\n"
        text += f" *{L['modules_used']}:* {len(modules_list)}/5\n"
        
        if user.get("created_at"):
            text += f" *{L['member_since']}:* {user['created_at'][:10]}\n"
        
        await message.answer(text, parse_mode="Markdown")
        
    except Exception as e:
        await message.answer(f"Error: {str(e)}")


@dp.message(Command("achievements"))
async def cmd_achievements(message: types.Message):
    lang = await get_user_lang(message.from_user.id)
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.get(f"{API_URL}/api/achievements/{message.from_user.id}")
            ach = resp.json()

        if not ach["achievements"]:
            await message.answer(TEXTS[lang]["no_achievements"])
            return

        text = TEXTS[lang]["achievements_header"]
        for a in ach["achievements"]:
            text += f"- {a['name']} - {a['desc']} (+{a['xp']} XP)\n"
        await message.answer(text)
    except Exception as e:
        await message.answer(f"Error: {str(e)}")


@dp.message(Command("help"))
async def cmd_help(message: types.Message):
    lang = await get_user_lang(message.from_user.id)
    await message.answer(TEXTS[lang]["help"])


@dp.message(Command("bind"))
async def cmd_bind(message: types.Message):
    lang = await get_user_lang(message.from_user.id)

    args = message.text.split(maxsplit=2)
    if len(args) < 3:
        await message.answer(TEXTS[lang]["bind_usage"])
        return

    email = args[1]
    password = args[2]

    try:
        async with httpx.AsyncClient() as client:
            user_resp = await client.get(f"{API_URL}/api/user/{message.from_user.id}")
            if user_resp.status_code == 200:
                user = user_resp.json()
                if user.get("email"):
                    await message.answer(TEXTS[lang]["bind_already"].format(email=user["email"]))
                    return

            resp = await client.post(
                f"{API_URL}/api/auth/bind",
                json={
                    "telegram_id": message.from_user.id,
                    "email": email,
                    "password": password
                },
                timeout=10.0
            )

            if resp.status_code == 200:
                await message.answer(TEXTS[lang]["bind_success"])
            else:
                await message.answer(TEXTS[lang]["bind_error"])
    except Exception as e:
        await message.answer(f"Error: {str(e)}")


@dp.message(Command("whoami"))
async def cmd_whoami(message: types.Message):
    lang = await get_user_lang(message.from_user.id)

    try:
        async with httpx.AsyncClient() as client:
            resp = await client.get(f"{API_URL}/api/user/{message.from_user.id}")
            if resp.status_code == 200:
                user = resp.json()
                if user.get("email"):
                    await message.answer(
                        TEXTS[lang]["whoami_bound"].format(email=user["email"])
                    )
                else:
                    await message.answer(TEXTS[lang]["whoami_not_bound"])
            else:
                await message.answer(TEXTS[lang]["whoami_not_bound"])
    except Exception as e:
        await message.answer(f"Error: {str(e)}")


@dp.message(Command("unbind"))
async def cmd_unbind(message: types.Message):
    lang = await get_user_lang(message.from_user.id)

    try:
        async with httpx.AsyncClient() as client:
            resp = await client.post(
                f"{API_URL}/api/auth/unbind",
                json={"telegram_id": message.from_user.id},
                timeout=10.0
            )

            if resp.status_code == 200:
                await message.answer(TEXTS[lang]["unbind_success"])
            else:
                await message.answer(TEXTS[lang]["unbind_not_bound"])
    except Exception as e:
        await message.answer(f"Error: {str(e)}")


async def main():
    print(f"Bot started. API: {API_URL}")
    await dp.start_polling(bot)


if __name__ == "__main__":
    asyncio.run(main())