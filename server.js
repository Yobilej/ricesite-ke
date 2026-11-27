// Ricesite KE - backend (Node.js built-ins only: no npm install needed)
const http = require('http'), fs = require('fs'), path = require('path'), crypto = require('crypto');
const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync(path.join(__dirname, 'ricesite.db'));

// ---- Database: the three entities from the ERD ----
db.exec(`
PRAGMA foreign_keys=ON;
CREATE TABLE IF NOT EXISTS users(user_id INTEGER PRIMARY KEY AUTOINCREMENT, full_name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL, phone TEXT, location TEXT,
  role TEXT NOT NULL CHECK(role IN('Farmer','Buyer','Administrator')),
  status TEXT NOT NULL DEFAULT 'Active', created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS rice_listing(listing_id INTEGER PRIMARY KEY AUTOINCREMENT,
  farmer_id INTEGER NOT NULL REFERENCES users(user_id), rice_variety TEXT NOT NULL, description TEXT,
  quantity REAL NOT NULL, unit TEXT NOT NULL, price_kes REAL NOT NULL, location TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'Active', date_posted TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS enquiry(enquiry_id INTEGER PRIMARY KEY AUTOINCREMENT,
  listing_id INTEGER NOT NULL REFERENCES rice_listing(listing_id),
  buyer_id INTEGER NOT NULL REFERENCES users(user_id), message TEXT NOT NULL,
  enquiry_date TEXT DEFAULT CURRENT_TIMESTAMP, status TEXT NOT NULL DEFAULT 'New');`);

const hash = p => { const s = crypto.randomBytes(16).toString('hex'); return s + ':' + crypto.scryptSync(p, s, 32).toString('hex'); };
const check = (p, h) => { const [s, k] = h.split(':'); return crypto.timingSafeEqual(Buffer.from(k, 'hex'), crypto.scryptSync(p, s, 32)); };

if (!db.prepare('SELECT 1 FROM users').get()) { // demo data on first run
  const u = db.prepare('INSERT INTO users(full_name,email,password_hash,phone,location,role) VALUES(?,?,?,?,?,?)');
  u.run('Site Admin', 'admin@ricesite.ke', hash('Admin@123'), '0700000000', 'Nairobi', 'Administrator');
  u.run('Demo Farmer', 'farmer@demo.ke', hash('Farmer@123'), '0711111111', 'Mwea, Kirinyaga', 'Farmer');
  u.run('Demo Buyer', 'buyer@demo.ke', hash('Buyer@123'), '0722222222', 'Nairobi', 'Buyer');
  const l = db.prepare('INSERT INTO rice_listing(farmer_id,rice_variety,description,quantity,unit,price_kes,location) VALUES(2,?,?,?,?,?,?)');
  l.run('Pishori', 'Aromatic, well dried and milled this season', 500, 'kg', 210, 'Mwea, Kirinyaga');
  l.run('Basmati 370', 'Long grain, good for pilau', 200, 'kg', 260, 'Ahero, Kisumu');
  l.run('IR 2793 (paddy)', 'Unmilled paddy rice', 50, 'bag (50kg)', 4200, 'Bunyala, Busia');
}

// ---- Helpers ----
const sessions = new Map();
const send = (r, c, o) => { r.writeHead(c, { 'Content-Type': 'application/json' }); r.end(JSON.stringify(o)); };
const err = (r, c, m) => send(r, c, { error: m });
const s = v => String(v ?? '').trim();
const readBody = q => new Promise(ok => { let d = ''; q.on('data', c => { d += c; if (d.length > 1e6) q.destroy(); });
  q.on('end', () => { try { ok(JSON.parse(d || '{}')); } catch { ok({}); } }); });
const startSession = (res, id) => { const token = crypto.randomUUID(); sessions.set(token, id);
  send(res, 200, { token, user: db.prepare('SELECT user_id,full_name,email,phone,location,role FROM users WHERE user_id=?').get(id) }); };
const count = (w) => db.prepare(`SELECT COUNT(*) n FROM ${w}`).get().n;

// ---- API ----
async function api(req, res, url) {
  const m = req.method, p = url.pathname, b = (m === 'POST' || m === 'PUT') ? await readBody(req) : {};
  const id = sessions.get((req.headers.authorization || '').replace('Bearer ', ''));
  const me = id ? db.prepare('SELECT user_id,full_name,email,phone,location,role,status FROM users WHERE user_id=?').get(id) : null;
  const need = (...roles) => {
    if (!me) { err(res, 401, 'Please log in'); return false; }
    if (me.status !== 'Active') { err(res, 403, 'Account suspended'); return false; }
    if (roles.length && !roles.includes(me.role)) { err(res, 403, 'Not allowed for your role'); return false; }
    return true; };
  let x;

  if (m === 'POST' && p === '/api/register') {
    const role = b.role === 'Farmer' ? 'Farmer' : b.role === 'Buyer' ? 'Buyer' : null, pw = String(b.password || '');
    if (!s(b.full_name) || !/^\S+@\S+\.\S+$/.test(s(b.email)) || pw.length < 8 || !role)
      return err(res, 400, 'Enter your name, a valid email, a role and a password of 8+ characters');
    try {
      const r = db.prepare('INSERT INTO users(full_name,email,password_hash,phone,location,role) VALUES(?,?,?,?,?,?)')
        .run(s(b.full_name), s(b.email).toLowerCase(), hash(pw), s(b.phone), s(b.location), role);
      return startSession(res, Number(r.lastInsertRowid));
    } catch { return err(res, 409, 'That email is already registered'); }
  }
  if (m === 'POST' && p === '/api/login') {
    const u = db.prepare('SELECT * FROM users WHERE email=?').get(s(b.email).toLowerCase());
    if (!u || !check(String(b.password || ''), u.password_hash)) return err(res, 401, 'Wrong email or password');
    if (u.status !== 'Active') return err(res, 403, 'Account suspended');
    return startSession(res, u.user_id);
  }
  if (m === 'GET' && p === '/api/me') return need() && send(res, 200, me);
  if (m === 'PUT' && p === '/api/me') {
    if (!need()) return;
    if (!s(b.full_name)) return err(res, 400, 'Name is required');
    db.prepare('UPDATE users SET full_name=?,phone=?,location=? WHERE user_id=?').run(s(b.full_name), s(b.phone), s(b.location), me.user_id);
    return send(res, 200, { ...me, full_name: s(b.full_name), phone: s(b.phone), location: s(b.location) });
  }

  // Listings (public browse/search)
  if (m === 'GET' && p === '/api/listings') {
    const q = '%' + s(url.searchParams.get('q')) + '%', loc = '%' + s(url.searchParams.get('location')) + '%';
    return send(res, 200, db.prepare(`SELECT l.*,u.full_name farmer_name FROM rice_listing l JOIN users u ON u.user_id=l.farmer_id
      WHERE l.status='Active' AND u.status='Active' AND (l.rice_variety LIKE ? OR l.description LIKE ?) AND l.location LIKE ?
      ORDER BY l.listing_id DESC`).all(q, q, loc));
  }
  if (m === 'POST' && p === '/api/listings') {
    if (!need('Farmer')) return;
    if (!s(b.rice_variety) || !s(b.location) || !(+b.quantity > 0) || !(+b.price_kes > 0) || !s(b.unit))
      return err(res, 400, 'Variety, quantity, unit, price and location are required');
    db.prepare('INSERT INTO rice_listing(farmer_id,rice_variety,description,quantity,unit,price_kes,location) VALUES(?,?,?,?,?,?,?)')
      .run(me.user_id, s(b.rice_variety), s(b.description), +b.quantity, s(b.unit), +b.price_kes, s(b.location));
    return send(res, 200, { ok: true });
  }
  if (m === 'GET' && p === '/api/my-listings') {
    if (!need('Farmer')) return;
    return send(res, 200, db.prepare('SELECT * FROM rice_listing WHERE farmer_id=? ORDER BY listing_id DESC').all(me.user_id));
  }
  if ((x = p.match(/^\/api\/listings\/(\d+)$/)) && m === 'PUT') {
    if (!need('Farmer', 'Administrator')) return;
    const l = db.prepare('SELECT * FROM rice_listing WHERE listing_id=?').get(x[1]);
    if (!l || (me.role === 'Farmer' && l.farmer_id !== me.user_id)) return err(res, 404, 'Listing not found');
    const st = ['Active', 'Inactive', 'Removed'].includes(b.status) ? b.status : l.status;
    if ((st === 'Removed' || l.status === 'Removed') && st !== l.status && me.role !== 'Administrator') return err(res, 403, 'Only the administrator can change a removed listing');
    db.prepare('UPDATE rice_listing SET status=?,price_kes=?,quantity=? WHERE listing_id=?')
      .run(st, +b.price_kes > 0 ? +b.price_kes : l.price_kes, +b.quantity > 0 ? +b.quantity : l.quantity, l.listing_id);
    return send(res, 200, { ok: true });
  }

  // Enquiries
  if (m === 'POST' && p === '/api/enquiries') {
    if (!need('Buyer')) return;
    const l = db.prepare("SELECT 1 FROM rice_listing WHERE listing_id=? AND status='Active'").get(+b.listing_id);
    if (!l || !s(b.message)) return err(res, 400, 'Choose an active listing and write a message');
    db.prepare('INSERT INTO enquiry(listing_id,buyer_id,message) VALUES(?,?,?)').run(+b.listing_id, me.user_id, s(b.message));
    return send(res, 200, { ok: true });
  }
  if (m === 'GET' && p === '/api/enquiries') {
    if (!need('Farmer', 'Buyer')) return;
    const sql = me.role === 'Farmer'
      ? `SELECT e.*,l.rice_variety,u.full_name buyer_name,u.email buyer_email,u.phone buyer_phone FROM enquiry e
         JOIN rice_listing l ON l.listing_id=e.listing_id JOIN users u ON u.user_id=e.buyer_id WHERE l.farmer_id=? ORDER BY e.enquiry_id DESC`
      : `SELECT e.*,l.rice_variety,f.full_name farmer_name,f.phone farmer_phone FROM enquiry e
         JOIN rice_listing l ON l.listing_id=e.listing_id JOIN users f ON f.user_id=l.farmer_id WHERE e.buyer_id=? ORDER BY e.enquiry_id DESC`;
    return send(res, 200, db.prepare(sql).all(me.user_id));
  }
  if ((x = p.match(/^\/api\/enquiries\/(\d+)$/)) && m === 'PUT') {
    if (!need('Farmer')) return;
    const r = db.prepare(`UPDATE enquiry SET status='Responded' WHERE enquiry_id=? AND listing_id IN
      (SELECT listing_id FROM rice_listing WHERE farmer_id=?)`).run(x[1], me.user_id);
    return r.changes ? send(res, 200, { ok: true }) : err(res, 404, 'Enquiry not found');
  }

  // Administration
  if (m === 'GET' && p === '/api/admin/summary') {
    if (!need('Administrator')) return;
    return send(res, 200, { farmers: count("users WHERE role='Farmer'"), buyers: count("users WHERE role='Buyer'"),
      activeListings: count("rice_listing WHERE status='Active'"), enquiries: count('enquiry'), newEnquiries: count("enquiry WHERE status='New'") });
  }
  if (m === 'GET' && p === '/api/admin/users') {
    if (!need('Administrator')) return;
    return send(res, 200, db.prepare("SELECT user_id,full_name,email,phone,location,role,status FROM users WHERE role!='Administrator' ORDER BY user_id DESC").all());
  }
  if ((x = p.match(/^\/api\/admin\/users\/(\d+)$/)) && m === 'PUT') {
    if (!need('Administrator')) return;
    if (!['Active', 'Suspended'].includes(b.status)) return err(res, 400, 'Invalid status');
    db.prepare("UPDATE users SET status=? WHERE user_id=? AND role!='Administrator'").run(b.status, x[1]);
    return send(res, 200, { ok: true });
  }
  if (m === 'GET' && p === '/api/admin/listings') {
    if (!need('Administrator')) return;
    return send(res, 200, db.prepare('SELECT l.*,u.full_name farmer_name FROM rice_listing l JOIN users u ON u.user_id=l.farmer_id ORDER BY l.listing_id DESC').all());
  }
}

// ---- Server: API + static files from /public ----
const types = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript' }, pub = path.join(__dirname, 'public');
http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname.startsWith('/api/')) { await api(req, res, url); if (!res.writableEnded) err(res, 404, 'Not found'); return; }
    const f = path.join(pub, url.pathname === '/' ? 'index.html' : url.pathname);
    if (!f.startsWith(pub) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end('Not found'); }
    res.writeHead(200, { 'Content-Type': types[path.extname(f)] || 'application/octet-stream' });
    fs.createReadStream(f).pipe(res);
  } catch (e) { console.error(e); if (!res.headersSent) err(res, 500, 'Server error'); }
}).listen(process.env.PORT || 3000, () => console.log('Ricesite KE running at http://localhost:' + (process.env.PORT || 3000)));
