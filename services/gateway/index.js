const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const rateLimit = require('express-rate-limit');
const morgan = require('morgan');

const app = express();
const PORT = process.env.PORT || 3000;

// ARCHITECT NOTE: The API Gateway is the SINGLE ENTRY POINT for all clients.
// All external traffic hits the gateway, which then routes to the right service.
// This pattern gives us:
//  ✅ One place for auth, rate limiting, logging — not duplicated per service
//  ✅ Internal services stay private (not exposed to the internet)
//  ✅ Easy to add new services without changing clients
// This is the "Backend For Frontend (BFF)" pattern.

// ─── Request Logging ───────────────────────────────────────────────────────────
// Every request gets logged: method, path, status, response time
app.use(morgan(':method :url :status :response-time ms'));

// ─── Rate Limiting ─────────────────────────────────────────────────────────────
// ARCHITECT NOTE: Rate limiting protects against DDoS and abusive clients.
// In production, we use Redis-backed rate limiting so all gateway instances
// share the same counters. In Phase 2, we'll add this to our K8s Ingress.
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // 100 requests per window per IP
    message: { error: 'Too many requests, please slow down.' },
    standardHeaders: true,
    legacyHeaders: false,
});
app.use(limiter);

// ─── Health Check ──────────────────────────────────────────────────────────────
app.get('/health', (req, res) => {
    res.json({ status: 'ok', service: 'gateway', version: '1.0.0' });
});

// ─── Service Registry ──────────────────────────────────────────────────────────
// ARCHITECT NOTE: In Phase 1, service URLs are hardcoded here (or from env vars).
// In Phase 2 (Kubernetes), this becomes K8s Service Discovery — the cluster
// automatically knows where each service is. We won't need hardcoded URLs anymore.
const services = {
    users: process.env.USER_SERVICE_URL || 'http://localhost:3001',
    products: process.env.PRODUCT_SERVICE_URL || 'http://localhost:3002',
    orders: process.env.ORDER_SERVICE_URL || 'http://localhost:3003',
    notifications: process.env.NOTIFICATION_SERVICE_URL || 'http://localhost:3004',
};

// ─── Routes → Service Proxies ──────────────────────────────────────────────────
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

// ─── 404 Catch-All ─────────────────────────────────────────────────────────────
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
