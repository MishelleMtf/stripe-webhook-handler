require('dotenv').config();
const express = require('express');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const nodemailer = require('nodemailer');
const app = express();

app.use(express.json({
  verify: (req, res, buf) => {
    req.rawBody = buf.toString();
  }
}));

const endpointSecret = process.env.STRIPE_ENDPOINT_SECRET;

app.post('/stripe-webhook', (req, res) => {
  const sig = req.headers['stripe-signature'];

  let event;

  try {
    event = stripe.webhooks.constructEvent(req.rawBody, sig, endpointSecret);
  } catch (err) {
    console.log(`Webhook Error: ${err.message}`);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const email = session.customer_email;
    const description = session.display_items ? session.display_items[0].custom.name : session.metadata.course_name;

    sendEmail(email, description);
  }

  res.status(200).send('Received!');
});

function sendEmail(to, courseName) {
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.EMAIL_SENDER,
      pass: process.env.EMAIL_PASSWORD
    }
  });

  const courseLink = generateCourseLink(courseName);

  const mailOptions = {
    from: process.env.EMAIL_SENDER,
    to: to,
    subject: 'Your course access link',
    text: `Here is your link: ${courseLink}`
  };

  transporter.sendMail(mailOptions, function(error, info){
    if (error) {
      console.log(error);
    } else {
      console.log('Email sent: ' + info.response);
    }
  });
}

function generateCourseLink(courseName) {
  if (courseName === "Course 1") {
    return "https://youtube.com/your-course-1";
  } else if (courseName === "Course 2") {
    return "https://youtube.com/your-course-2";
  }
  return "https://youtube.com/default-course";
}

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Running on port ${port}`));
