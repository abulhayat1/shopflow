const express = require('express');
const { Pool } = require('pg');

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3002;

const pool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    database: process.env.DB_NAME || 'shopflow_products',
    user: process.env.DB_USER || 'shopflow',
    password: process.env.DB_PASSWORD || 'shopflow123',
});

app.get('/health', async (req, res) => {
    try {
        await pool.query('SELECT 1');
        res.json({ status: 'ok', service: 'product-service', db: 'connected' });
    } catch {
        res.status(503).json({ status: 'error', service: 'product-service', db: 'disconnected' });
    }
});

app.get('/api/products', async (req, res) => {
    const { category, limit = 20, offset = 0 } = req.query;
    try {
        let query = 'SELECT * FROM products WHERE stock > 0';
        const params = [];
        if (category) { query += ` AND category = $${params.length + 1}`; params.push(category); }
        query += ` ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
        params.push(limit, offset);

        const result = await pool.query(query, params);
        res.json({ products: result.rows, count: result.rowCount });
    } catch (err) {
        console.error('[product-service] list error:', err.message);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.get('/api/products/:id', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM products WHERE id = $1', [req.params.id]);
        if (result.rows.length === 0) return res.status(404).json({ error: 'Product not found' });
        res.json({ product: result.rows[0] });
    } catch (err) {
        console.error('[product-service] get error:', err.message);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.post('/api/products', async (req, res) => {
    const { name, description, price, stock, category, image_url } = req.body;
    if (!name || !price || stock === undefined)
        return res.status(400).json({ error: 'name, price, stock are required' });

    try {
        const result = await pool.query(
            `INSERT INTO products (name, description, price, stock, category, image_url)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
            [name, description, price, stock, category, image_url]
        );
        res.status(201).json({ product: result.rows[0] });
    } catch (err) {
        console.error('[product-service] create error:', err.message);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.patch('/api/products/:id/stock', async (req, res) => {
    const { quantity } = req.body; // negative to decrement, positive to restock
    try {
        const result = await pool.query(
            'UPDATE products SET stock = stock + $1 WHERE id = $2 AND stock + $1 >= 0 RETURNING *',
            [quantity, req.params.id]
        );
        if (result.rows.length === 0)
            return res.status(409).json({ error: 'Insufficient stock or product not found' });
        res.json({ product: result.rows[0] });
    } catch (err) {
        console.error('[product-service] stock update error:', err.message);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.listen(PORT, () => {
    console.log(`[product-service] Running on port ${PORT}`);
});
