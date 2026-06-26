# راه‌اندازی OpenAI API برای تست محلی TecPey

برای فعال شدن مربی هوشمند، کلید را داخل فایل `.env.local` بگذار، نه داخل `.env.local.example`.

```bash
cd ~/Desktop/tecpey_10
cp .env.local.example .env.local
nano .env.local
```

داخل فایل:

```env
OPENAI_API_KEY=sk-proj-YOUR_TEST_KEY
AI_MENTOR_MODEL=gpt-4o-mini
```

بعد از ذخیره، سرور را کامل ببند و دوباره اجرا کن:

```bash
CTRL+C
npm run build
npm start
```

نکته امنیتی: کلید واقعی را داخل `.env.local.example`، Git، ZIP عمومی یا اسکرین‌شات قرار نده. برای Production یک کلید جدید بساز و کلید تست را Revoke کن.
