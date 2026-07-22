const express = require('express');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;
const API_KEY = process.env.ANTHROPIC_API_KEY;

app.use(express.json({ limit: '15mb' })); // rasm base64 uchun katta limit
app.use(express.static(path.join(__dirname, 'public')));

// Bilimlar bazasini bir marta yuklab olamiz (server ishga tushganda)
const KB = JSON.parse(fs.readFileSync(path.join(__dirname, 'public/data/kb.json'), 'utf-8'));

app.post('/api/analyze', async (req, res) => {
  try {
    if (!API_KEY) {
      return res.status(500).json({ error: 'Server sozlanmagan: ANTHROPIC_API_KEY topilmadi.' });
    }

    const { base64, mediaType } = req.body;
    if (!base64) {
      return res.status(400).json({ error: 'Rasm topilmadi.' });
    }

    const refList = JSON.stringify(KB.compact);
    const systemPrompt = `Siz Yordamchi Agronom AI tashxis tizimisiz. Sizga O'zbekistonda uchraydigan ekin/gul turlari va ularning kasallik-zararkunandalari ro'yxati (JSON massiv, har bir element {ekin, nomi, turi}) beriladi:
${refList}

Vazifa: foydalanuvchi yuborgan rasmni tahlil qiling va agar mumkin bo'lsa, YUQORIDAGI RO'YXATDAGI nomlarga ANIQ mos keluvchi natijani tanlang ('ekin' va 'nomi' maydonlarini ro'yxatdagidek AYNAN yozing). Agar ro'yxatdagi hech biriga mos kelmasa yoki o'simlik sog'lom bo'lsa, tegishlicha belgilang. FAQAT quyidagi JSON formatida javob bering, boshqa hech qanday matn yoki markdown belgilarisiz:
{"holat": "kasal" | "soglom" | "nomalum", "ekin": "ro'yxatdagi ekin nomi yoki aniqlangan o'simlik nomi", "nomi": "ro'yxatdagi kasallik/zararkunanda nomi (aynan mos), yoki bo'sh qatordir", "turi": "Zamburug'" | "Bakteriya" | "Virus" | "Zararkunanda" | "Fiziologik" | "", "ishonch": 0 dan 100 gacha son, "daraja": "past" | "orta" | "yuqori", "tavsif": "agar ro'yxatda topilmasa, rasmda ko'rilgan alomatlarning 2-3 gapli tavsifi, o'zbek tilida", "tavsif_chora": "agar ro'yxatda topilmasa, umumiy tavsiya, o'zbek tilida"}`;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-5',
        max_tokens: 1000,
        system: systemPrompt,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'image', source: { type: 'base64', media_type: mediaType || 'image/jpeg', data: base64 } },
              { type: 'text', text: "Ushbu o'simlik/barg/meva/tana suratini tahlil qiling va ro'yxat asosida tashxis qo'ying." },
            ],
          },
        ],
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('Anthropic API xatosi:', data);
      return res.status(response.status).json({ error: data.error?.message || 'AI xizmatidan xatolik qaytdi.' });
    }

    const textBlock = (data.content || []).map((b) => b.text || '').join('\n').trim();
    const clean = textBlock.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(clean);
    res.json(parsed);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Tahlil amalga oshmadi. Qaytadan urinib ko\'ring.' });
  }
});

app.listen(PORT, () => {
  console.log(`Yordamchi Agronom AI serveri ishga tushdi: http://localhost:${PORT}`);
});
