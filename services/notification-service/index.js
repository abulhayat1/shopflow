const express = require('express');
const nodemailer = require('nodemailer');

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3004;

const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'localhost',
    port: process.env.SMTP_PORT || 1025,
    secure: false,
    auth: process.env.SMTP_USER
        ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
        : undefined,
});

app.get('/health', (req, res) => {
    res.json({ status: 'ok', service: 'notification-service' });
});

app.post('/api/notifications/order-confirmed', async (req, res) => {
    const { user_id, order_id, total_amount } = req.body;

    console.log(`[notification-service] 📧 Order #${order_id} confirmed for user #${user_id} — $${total_amount}`);

    try {
        await transporter.sendMail({
            from: '"ShopFlow" <no-reply@shopflow.io>',
            to: `user-${user_id}@shopflow.io`, // placeholder — real email comes from user-service
            subject: `✅ Order #${order_id} Confirmed!`,
            html: `
        <h2>Thanks for your order!</h2>
        <p>Your order <strong>#${order_id}</strong> has been confirmed.</p>
        <p>Total: <strong>$${total_amount}</strong></p>
        <p>We'll ship it soon. 🚀</p>
      `,
        });
        console.log(`[notification-service] Email sent for order #${order_id}`);
    } catch (err) {
        console.warn(`[notification-service] Email failed (non-critical):`, err.message);
    }

    res.json({ sent: true, order_id });
});

app.post('/api/notifications/order-shipped', async (req, res) => {
    const { user_id, order_id, tracking_number } = req.body;

    console.log(`[notification-service] 📦 Order #${order_id} shipped! Tracking: ${tracking_number}`);
    res.json({ sent: true, order_id, tracking_number });
});

app.post('/api/notifications/low-stock', async (req, res) => {
    const { product_id, product_name, stock } = req.body;

    console.warn(`[notification-service] ⚠️  LOW STOCK ALERT: "${product_name}" (ID: ${product_id}) — only ${stock} left`);
    res.json({ alerted: true, product_id });
});

app.listen(PORT, () => {
    console.log(`[notification-service] Running on port ${PORT}`);
});
