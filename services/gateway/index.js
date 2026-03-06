const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const rateLimit = require('express-rate-limit');
const morgan = require('morgan');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(morgan(':method :url :status :response-time ms'));

const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // 100 requests per window per IP
    message: { error: 'Too many requests, please slow down.' },
    standardHeaders: true,
    legacyHeaders: false,
});
app.use(limiter);

app.get('/health', (req, res) => {
    res.json({ status: 'ok', service: 'gateway', version: '1.0.0' });
});

const services = {
    users: process.env.USER_SERVICE_URL || 'http://localhost:3001',
    products: process.env.PRODUCT_SERVICE_URL || 'http://localhost:3002',
    orders: process.env.ORDER_SERVICE_URL || 'http://localhost:3003',
    notifications: process.env.NOTIFICATION_SERVICE_URL || 'http://localhost:3004',
};

app.use('/api/users', createProxyMiddleware({
    target: services.users,
    changeOrigin: true,
    on: {
        error: (err, req, res) => {
            console.error('[gateway] user-service unreachable:', err.message);
            res.status(503).json({ error: 'User service is temporarily unavailable' });
        }
    }
}));

app.use('/api/products', createProxyMiddleware({
    target: services.products,
    changeOrigin: true,
    on: {
        error: (err, req, res) => {
            console.error('[gateway] product-service unreachable:', err.message);
            res.status(503).json({ error: 'Product service is temporarily unavailable' });
        }
    }
}));

app.use('/api/orders', createProxyMiddleware({
    target: services.orders,
    changeOrigin: true,
    on: {
        error: (err, req, res) => {
            console.error('[gateway] order-service unreachable:', err.message);
            res.status(503).json({ error: 'Order service is temporarily unavailable' });
        }
    }
}));

app.use((req, res) => {
    res.status(404).json({ error: `Route ${req.method} ${req.path} not found` });
});

app.listen(PORT, () => {
    console.log(`[gateway] ShopFlow API Gateway running on port ${PORT}`);
    console.log(`[gateway] Routing:`);
    console.log(`  /api/users      → ${services.users}`);
    console.log(`  /api/products   → ${services.products}`);
    console.log(`  /api/orders     → ${services.orders}`);
});
