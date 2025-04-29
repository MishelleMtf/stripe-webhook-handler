require('dotenv').config();

const express = require('express');
const stripe  = require('stripe')(process.env.STRIPE_SECRET_KEY);
const nodemailer = require('nodemailer');

const app = express();
const endpointSecret = process.env.STRIPE_ENDPOINT_SECRET;

/* ─────────────────────  Health-check ───────────────────── */
app.get('/', (_, res) => res.send('ok'));

/* ─────────────────────  Webhook  ───────────────────────── */
app.post(
  '/stripe-webhook',
  // Stripe требует *сырое* тело, иначе подпись не пройдёт
  express.raw({ type: 'application/json' }),
  async (req, res) => {
    const sig = req.headers['stripe-signature'];
    let event;

    /* 1. Проверяем подпись */
    try {
      event = stripe.webhooks.constructEvent(req.body, sig, endpointSecret);
    } catch (err) {
      console.error('⚠️  Signature error:', err.message);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    /* 2. Интересует только успешная оплата */
    if (event.type !== 'checkout.session.completed') {
      return res.json({ received: true });
    }

    const session = event.data.object;

    if (session.payment_status !== 'paid') {
      return res.json({ received: true });
    }

    /* 3. Достаём email и название курса */
    try {
      const email = session.customer_details.email;          // надёжнее чем customer_email
      const { data: [item] } =
        await stripe.checkout.sessions.listLineItems(session.id, { limit: 1 });

      const courseName = item?.description || 'Course';

      /* 4. Отправляем письмо */
      await sendEmail(email, courseName, session.id);
      console.log(`✅ Email sent to ${email} for ${courseName}`);
    } catch (err) {
      console.error('❌ Processing error:', err);
      // здесь можно добавить повторную отправку / логирование
    }

    /* 5. Сообщаем Stripe, что всё принято */
    res.json({ received: true });
  }
);

/* ─────────────────────  Почта  ─────────────────────────── */
async function sendEmail(to, courseName, sessionId) {
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.EMAIL_SENDER,
      pass: process.env.EMAIL_PASSWORD      // 16-символьный App-Password
    }
  });

  const courseLink = `https://example.com/course/${sessionId}`;

  await transporter.sendMail({
    from: `"Shuffle School" <${process.env.EMAIL_SENDER}>`,
    to,
    subject: `Access to ${courseName}`,
    text:
`Thank you for your purchase!

Open your course: ${courseLink}

Happy learning & keep shuffling!`
  });
}

/* ─────────────────────  Start  ─────────────────────────── */
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
