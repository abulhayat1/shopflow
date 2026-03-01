const express = require('express');
const { Pool } = require('pg');
const axios = require('axios');

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3003;

const pool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    database: process.env.DB_NAME || 'shopflow_orders',
    user: process.env.DB_USER || 'shopflow',
    password: process.env.DB_PASSWORD || 'shopflow123',
});

// Internal service URLs
// ARCHITECT NOTE: In Phase 1, we use direct HTTP calls between services.
// This is called "synchronous inter-service communication" and it creates
// tight coupling. In Phase 4, we'll replace some of these with async
// message queues (SQS/SNS). For now, it teaches the communication problem clearly.
const PRODUCT_SERVICE = process.env.PRODUCT_SERVICE_URL || 'http://localhost:3002';
const NOTIFICATION_SERVICE = process.env.NOTIFICATION_SERVICE_URL || 'http://localhost:3004';

// ─── Health Check ──────────────────────────────────────────────────────────────
app.get('/health', async (req, res) => {
    try {
        await pool.query('SELECT 1');
        res.json({ status: 'ok', service: 'order-service', db: 'connected' });
    } catch {
        res.status(503).json({ status: 'error', service: 'order-service', db: 'disconnected' });
    }
});

// ─── Create Order ──────────────────────────────────────────────────────────────
app.post('/api/orders', async (req, res) => {
    const { user_id, items } = req.body;
    // items: [{ product_id, quantity }]
    if (!user_id || !items || items.length === 0)
        return res.status(400).json({ error: 'user_id and items[] are required' });

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        let totalAmount = 0;
        const orderItems = [];

        // Validate and reserve stock for each item
        for (const item of items) {
            const productRes = await axios.get(`${PRODUCT_SERVICE}/api/products/${item.product_id}`);
            const product = productRes.data.product;

            if (product.stock < item.quantity)
                throw { status: 409, message: `Insufficient stock for "${product.name}"` };

            totalAmount += product.price * item.quantity;
            orderItems.push({ ...item, product_name: product.name, unit_price: product.price });
        }

        // Create the order
        const orderResult = await client.query(
            `INSERT INTO orders (user_id, total_amount, status)
       VALUES ($1, $2, 'pending') RETURNING *`,
            [user_id, totalAmount]
        );
        const order = orderResult.rows[0];

        // Insert order items
        for (const item of orderItems) {
            await client.query(
                `INSERT INTO order_items (order_id, product_id, product_name, quantity, unit_price)
         VALUES ($1, $2, $3, $4, $5)`,
                [order.id, item.product_id, item.product_name, item.quantity, item.unit_price]
            );

            // Decrement stock in product-service
            await axios.patch(`${PRODUCT_SERVICE}/api/products/${item.product_id}/stock`, {
                quantity: -item.quantity,
            });
        }

        // Update order to confirmed
        await client.query("UPDATE orders SET status = 'confirmed' WHERE id = $1", [order.id]);
        await client.query('COMMIT');

        order.status = 'confirmed';
        order.items = orderItems;

        // Fire notification (non-blocking — we don't wait for it)
        axios.post(`${NOTIFICATION_SERVICE}/api/notifications/order-confirmed`, {
            user_id, order_id: order.id, total_amount: totalAmount
        }).catch(err => console.warn('[order-service] notification failed:', err.message));

        res.status(201).json({ order });
    } catch (err) {
        await client.query('ROLLBACK');
        if (err.status) return res.status(err.status).json({ error: err.message });
        console.error('[order-service] create order error:', err.message);
        res.status(500).json({ error: 'Internal server error' });
    } finally {
        client.release();
    }
});

// ─── Get User Orders ───────────────────────────────────────────────────────────
app.get('/api/orders/user/:userId', async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT o.*, json_agg(oi) as items
       FROM orders o
       LEFT JOIN order_items oi ON oi.order_id = o.id
       WHERE o.user_id = $1
       GROUP BY o.id ORDER BY o.created_at DESC`,
            [req.params.userId]
        );
        res.json({ orders: result.rows });
    } catch (err) {
        console.error('[order-service] get orders error:', err.message);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// ─── Get Single Order ──────────────────────────────────────────────────────────
app.get('/api/orders/:id', async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT o.*, json_agg(oi) as items
       FROM orders o
       LEFT JOIN order_items oi ON oi.order_id = o.id
       WHERE o.id = $1 GROUP BY o.id`,
            [req.params.id]
        );
        if (result.rows.length === 0) return res.status(404).json({ error: 'Order not found' });
        res.json({ order: result.rows[0] });
    } catch (err) {
        console.error('[order-service] get order error:', err.message);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.listen(PORT, () => {
    console.log(`[order-service] Running on port ${PORT}`);
});
