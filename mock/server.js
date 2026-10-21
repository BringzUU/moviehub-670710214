// Backend จำลองของ MovieHub: ทำตัวเหมือน API ของทีม Go ทุกประการ (path, JSON, status code)
// แต่เก็บข้อมูลในหน่วยความจำ ปิดแล้วหาย  รัน:  npm run mock   (พอร์ต 4000)
// สัญญาทั้งหมดอยู่ใน docs/db-schema.md หัวข้อ 6 และ 7

const express = require('express');
const cors = require('cors');
const movies = require('./movies.json');          // 100 เรื่องชุดเดียวกับ seed.sql ของทีม Go

const app = express();
app.use(cors());                                   // Go จริงต้องเปิด CORS แบบนี้เหมือนกัน
app.use(express.json());                           // แปลง body ที่เป็น JSON ให้เป็น object (req.body)

// log ทุก request จะได้เห็นหน้าห้องว่าหน้าเว็บยิงอะไรมา
app.use((req, res, next) => {
  res.on('finish', () => console.log(`${req.method} ${req.originalUrl} -> ${res.statusCode}`));
  next();
});

// ---------- "ฐานข้อมูล" ในหน่วยความจำ ----------
const db = {
  members: [
    { id: 1, email: 'demo@moviehub.test', password: '1234', displayName: 'Demo', role: 'member', createdAt: new Date().toISOString() },
    { id: 2, email: 'admin@moviehub.test', password: '1234', displayName: 'Admin', role: 'admin', createdAt: new Date().toISOString() },
  ],
  tokens: new Map(),                               // token -> memberId
  reviews: [],                                     // { id, memberId, movieId, text, createdAt, updatedAt }
  votes: [],                                       // { memberId, movieId, score }
  wishlist: [],                                    // { memberId, movieId, note, addedAt }
};
let nextMemberId = 3;
let nextReviewId = 1;

const publicMember = (m) => ({ id: m.id, email: m.email, displayName: m.displayName, role: m.role });
const findMovie = (id) => movies.find(m => m.id === Number(id));

// ---------- middleware: ต้อง login (endpoint ที่มี 🔒 ในสัญญา) ----------
function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';            // "Bearer mock.1.xxxx"
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  const memberId = db.tokens.get(token);
  if (!memberId) return res.status(401).json({ error: 'กรุณาเข้าสู่ระบบก่อน' });
  req.member = db.members.find(m => m.id === memberId);     // รู้ว่าใครจาก token ไม่รับจาก body
  next();
}

// ---------- หนัง ----------
app.get('/api/movies', (req, res) => {
  const q = (req.query.q || '').trim().toLowerCase();
  const items = q
    ? movies.filter(m => m.title.toLowerCase().includes(q) || (m.titleTh || '').toLowerCase().includes(q))
    : movies;
  res.json({ items });
});

app.get('/api/movies/:id', (req, res) => {
  const movie = findMovie(req.params.id);
  if (!movie) return res.status(404).json({ error: 'ไม่พบหนังเรื่องนี้' });
  const stats = db.votes.filter(v => v.movieId === movie.id);
  res.json({
    ...movie,
    memberVoteCount: stats.length,
    memberRating: stats.length ? Math.round(stats.reduce((s, v) => s + v.score, 0) / stats.length * 10) / 10 : null,
  });
});

// ---------- สมาชิก ----------
app.post('/api/auth/register', (req, res) => {
  const { email = '', password = '', displayName = '' } = req.body || {};
  if (!email.includes('@') || password.length < 4 || !displayName.trim()) {
    return res.status(400).json({ error: 'กรอกอีเมล รหัสผ่าน (4 ตัวขึ้นไป) และชื่อที่แสดงให้ครบ' });
  }
  if (db.members.some(m => m.email.toLowerCase() === email.toLowerCase())) {
    return res.status(409).json({ error: 'อีเมลนี้ถูกใช้แล้ว' });          // Go: unique index ชน (23505)
  }
  const member = { id: nextMemberId++, email: email.toLowerCase(), password, displayName: displayName.trim(), role: 'member', createdAt: new Date().toISOString() };
  db.members.push(member);                         // Go จริงเก็บ bcrypt hash ไม่เก็บรหัสผ่านตรง ๆ แบบนี้
  res.status(201).json(publicMember(member));
});

app.post('/api/auth/login', (req, res) => {
  const { email = '', password = '' } = req.body || {};
  const member = db.members.find(m => m.email === email.toLowerCase());
  if (!member || member.password !== password) {
    return res.status(401).json({ error: 'อีเมลหรือรหัสผ่านไม่ถูกต้อง' });   // ข้อความเดียวกันทั้ง 2 กรณี
  }
  const token = `mock.${member.id}.${Math.random().toString(36).slice(2)}`;
  db.tokens.set(token, member.id);
  res.json({ token, member: publicMember(member) });
});

app.get('/api/me', requireAuth, (req, res) => res.json(publicMember(req.member)));

// ---------- หลังบ้าน (Week 12): ทุกเส้นทางใต้ /api/admin ต้อง login และเป็น admin ----------
// 401 = ไม่มีตั๋ว, 403 = มีตั๋วแต่ไม่ใช่ admin (เหมือน RequireLogin + RequireRole ของ Go)
function requireAdmin(req, res, next) {
  requireAuth(req, res, () => {
    if (req.member.role !== 'admin') return res.status(403).json({ error: 'ต้องเป็น admin เท่านั้น' });
    next();
  });
}

const adminMember = (m) => ({ ...publicMember(m), createdAt: m.createdAt });
const TMDB_IMG = 'https://image.tmdb.org/t/p/w500';
const posterUrl = (p) => (!p ? null : p.startsWith('http') ? p : TMDB_IMG + p);

// แนวหนังสำหรับ dropdown: สร้างจาก genre ในไฟล์ movies.json
const genres = [];
movies.forEach(m => {
  if (m.genre && !genres.some(g => g.nameEn === m.genre)) {
    genres.push({ id: genres.length + 1, nameEn: m.genre, nameTh: m.genreTh || null });
  }
});
const genreById = (id) => genres.find(g => g.id === Number(id));

app.get('/api/genres', (req, res) => res.json({ items: genres }));

app.get('/api/admin/stats', requireAdmin, (req, res) => {
  const byMovie = new Map();
  db.votes.forEach(v => {
    const a = byMovie.get(v.movieId) || { sum: 0, n: 0 };
    a.sum += v.score; a.n += 1;
    byMovie.set(v.movieId, a);
  });
  const topVoted = [...byMovie.entries()]
    .map(([id, a]) => ({ id, voteCount: a.n, voteAverage: Math.round(a.sum / a.n * 10) / 10 }))
    .filter(t => findMovie(t.id))
    .sort((a, b) => b.voteAverage - a.voteAverage || b.voteCount - a.voteCount)
    .slice(0, 5)
    .map(t => { const m = findMovie(t.id); return { ...t, title: m.title, titleTh: m.titleTh || null, poster: m.poster || null }; });
  res.json({
    movies: movies.length,
    members: db.members.length,
    admins: db.members.filter(m => m.role === 'admin').length,
    votes: db.votes.length,
    wishlistItems: db.wishlist.length,
    newestMembers: [...db.members].sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id - a.id).slice(0, 5).map(adminMember),
    topVoted,
  });
});

app.get('/api/admin/members', requireAdmin, (req, res) => {
  const items = [...db.members].sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id - a.id).map(adminMember);
  res.json({ items });
});

app.put('/api/admin/members/:id/role', requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  const role = req.body?.role;
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'เลขสมาชิกต้องเป็นตัวเลข' });
  if (role !== 'member' && role !== 'admin') return res.status(400).json({ error: 'role ต้องเป็น member หรือ admin' });
  if (id === req.member.id) return res.status(400).json({ error: 'เปลี่ยนบทบาทของตัวเองไม่ได้ ให้ admin คนอื่นทำแทน' });
  const target = db.members.find(m => m.id === id);
  if (!target) return res.status(404).json({ error: 'ไม่พบสมาชิกคนนี้' });
  target.role = role;
  res.json(adminMember(target));
});

// หนัง: มุมมองของ admin (ช่องเดียวกับ AdminMovie ใน Go)
function adminMovie(m) {
  const genre = genres.find(g => g.nameEn === m.genre);
  const impact = {
    reviews: db.reviews.filter(r => r.movieId === m.id).length,
    votes: db.votes.filter(v => v.movieId === m.id).length,
    wishlist: db.wishlist.filter(w => w.movieId === m.id).length,
  };
  return {
    id: m.id,
    title: m.title,
    titleTh: m.titleTh ?? null,
    originalTitle: m.originalTitle ?? m.title,
    originalLanguage: m.originalLanguage ?? 'en',
    overview: m.overview ?? null,
    overviewTh: m.overviewTh ?? m.detail ?? null,
    posterPath: m.posterPath ?? m.poster ?? null,
    releaseDate: m.releaseDate ?? null,
    genreId: genre ? genre.id : null,
    poster: m.poster ?? null,
    voteAverage: m.rating ?? 0,
    updatedAt: m.updatedAt ?? new Date().toISOString(),
    impact,
  };
}

// ตรวจข้อมูลซ้ำที่ server (ฟอร์ม React ข้ามได้ด้วย curl) คืน error ภาษาไทย หรือ null ถ้าผ่าน
function validateMovie(b) {
  const title = (b.title || '').trim();
  if (!title || title.length > 255) return 'ต้องมีชื่อเรื่อง และยาวไม่เกิน 255 ตัวอักษร';
  const lang = (b.originalLanguage || 'en').trim().toLowerCase();
  if (lang.length !== 2) return 'รหัสภาษาต้องเป็น 2 ตัวอักษร เช่น en, th, ja';
  const poster = (b.posterPath || '').trim();
  if (poster && !poster.startsWith('/') && !poster.startsWith('http')) return 'โปสเตอร์ต้องเป็น path ของ TMDB (/xxx.jpg) หรือ URL เต็ม (https://...)';
  const date = (b.releaseDate || '').trim();
  if (date && (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date)))) return 'วันฉายต้องอยู่ในรูปแบบ YYYY-MM-DD';
  if (b.genreId != null && !genreById(b.genreId)) return 'ไม่มีแนวหนังรหัสนี้';
  return null;
}

// แปลง body จากฟอร์มเป็นช่องที่เก็บในหนัง (ช่องที่หน้า Movies ใช้ เช่น genre, year, poster, detail ก็อัปเดตตามด้วย)
function applyMovieFields(m, b) {
  const nz = (s) => (typeof s === 'string' && s.trim() ? s.trim() : null);
  const g = b.genreId != null ? genreById(b.genreId) : null;
  m.title = b.title.trim();
  m.titleTh = nz(b.titleTh);
  m.originalTitle = nz(b.originalTitle) || m.title;
  m.originalLanguage = (b.originalLanguage || 'en').trim().toLowerCase();
  m.overview = nz(b.overview);
  m.overviewTh = nz(b.overviewTh);
  m.posterPath = nz(b.posterPath);
  m.poster = posterUrl(m.posterPath);
  m.releaseDate = nz(b.releaseDate);
  m.year = m.releaseDate ? Number(m.releaseDate.slice(0, 4)) : null;
  m.detail = m.overviewTh || m.overview || '';
  m.genre = g ? g.nameEn : null;
  m.genreTh = g ? g.nameTh : null;
  m.updatedAt = new Date().toISOString();
  return m;
}

app.get('/api/admin/movies/:id', requireAdmin, (req, res) => {
  const m = findMovie(req.params.id);
  if (!m) return res.status(404).json({ error: 'ไม่พบหนังเรื่องนี้' });
  res.json(adminMovie(m));
});

app.post('/api/admin/movies', requireAdmin, (req, res) => {
  const b = req.body || {};
  const id = Number(b.id) || 0;
  if (id < 0) return res.status(400).json({ error: 'เลขหนังต้องเป็น 0 (ให้ระบบออก) หรือเลขบวก' });
  const err = validateMovie(b);
  if (err) return res.status(400).json({ error: err });
  if (id && findMovie(id)) return res.status(409).json({ error: 'มีหนังเลขนี้อยู่แล้ว' });
  const newId = id || Math.max(9000000, ...movies.map(m => m.id + 1));       // เริ่มที่ 9000000 กันชนกับเลข TMDB
  const m = applyMovieFields({ id: newId, tmdbId: null, rating: null, list: null }, b);
  movies.push(m);
  res.status(201).json(adminMovie(m));
});

app.put('/api/admin/movies/:id', requireAdmin, (req, res) => {
  const m = findMovie(req.params.id);
  if (!m) return res.status(404).json({ error: 'ไม่พบหนังเรื่องนี้' });
  const err = validateMovie(req.body || {});
  if (err) return res.status(400).json({ error: err });
  applyMovieFields(m, req.body);
  res.json(adminMovie(m));
});

app.delete('/api/admin/movies/:id', requireAdmin, (req, res) => {
  const i = movies.findIndex(m => m.id === Number(req.params.id));
  if (i < 0) return res.status(404).json({ error: 'ไม่พบหนังเรื่องนี้' });
  const id = movies[i].id;
  movies.splice(i, 1);
  // เหมือน ON DELETE CASCADE ใน schema: รีวิว โหวต wishlist ของเรื่องนี้หายตาม
  db.reviews = db.reviews.filter(r => r.movieId !== id);
  db.votes = db.votes.filter(v => v.movieId !== id);
  db.wishlist = db.wishlist.filter(w => w.movieId !== id);
  res.status(204).end();
});

// ---------- รีวิว ----------
app.get('/api/movies/:id/reviews', (req, res) => {
  const movieId = Number(req.params.id);
  const items = db.reviews
    .filter(r => r.movieId === movieId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map(r => {
      const m = db.members.find(x => x.id === r.memberId);
      const v = db.votes.find(x => x.memberId === r.memberId && x.movieId === movieId);
      return { id: r.id, text: r.text, createdAt: r.createdAt, updatedAt: r.updatedAt,
              member: { id: m.id, displayName: m.displayName }, score: v ? v.score : null };
    });
  res.json({ items });
});

app.post('/api/movies/:id/reviews', requireAuth, (req, res) => {
  const movieId = Number(req.params.id);
  const text = (req.body?.text || '').trim();
  if (text.length < 10) return res.status(400).json({ error: 'รีวิวสั้นเกินไป' });
  if (db.reviews.some(r => r.memberId === req.member.id && r.movieId === movieId)) {
    return res.status(409).json({ error: 'คุณรีวิวเรื่องนี้ไปแล้ว' });
  }
  const now = new Date().toISOString();
  const review = { id: nextReviewId++, memberId: req.member.id, movieId, text,
                   createdAt: now, updatedAt: now };
  db.reviews.push(review);
  res.status(201).json({ id: review.id, text, createdAt: now });
});

app.delete('/api/reviews/:reviewId', requireAuth, (req, res) => {
  const i = db.reviews.findIndex(r => r.id === Number(req.params.reviewId) && r.memberId === req.member.id);
  if (i < 0) return res.status(404).json({ error: 'ไม่พบรีวิว' });
  db.reviews.splice(i, 1);
  res.status(204).end();
});

// ---------- คะแนน ----------
app.put('/api/movies/:id/vote', requireAuth, (req, res) => {
  const movieId = Number(req.params.id);
  const score = req.body?.score;
  if (!Number.isInteger(score) || score < 1 || score > 10) {
    return res.status(400).json({ error: 'score ต้องเป็นจำนวนเต็ม 1 ถึง 10' });
  }
  const existing = db.votes.find(v => v.memberId === req.member.id && v.movieId === movieId);
  if (existing) existing.score = score; else db.votes.push({ memberId: req.member.id, movieId, score });
  res.json({ movieId, score });
});

app.delete('/api/movies/:id/vote', requireAuth, (req, res) => {
  const movieId = Number(req.params.id);
  db.votes = db.votes.filter(v => !(v.memberId === req.member.id && v.movieId === movieId));
  res.status(204).end();
});

// ---------- Wishlist ----------
app.get('/api/me/wishlist', requireAuth, (req, res) => {
  const items = db.wishlist
    .filter(w => w.memberId === req.member.id)
    .sort((a, b) => b.addedAt.localeCompare(a.addedAt))
    .map(w => ({ ...(findMovie(w.movieId) || { id: w.movieId, title: `หนัง #${w.movieId}` }), note: w.note, addedAt: w.addedAt }));
  res.json({ items });
});

app.put('/api/me/wishlist/:movieId', requireAuth, (req, res) => {
  const movieId = Number(req.params.movieId);
  const existing = db.wishlist.find(w => w.memberId === req.member.id && w.movieId === movieId);
  const note = req.body?.note ?? null;
  if (existing) existing.note = note;
  else db.wishlist.push({ memberId: req.member.id, movieId, note, addedAt: new Date().toISOString() });
  res.json({ movieId, note });                       // กดซ้ำกี่ครั้งผลเหมือนเดิม (PUT)
});

app.delete('/api/me/wishlist/:movieId', requireAuth, (req, res) => {
  const movieId = Number(req.params.movieId);
  db.wishlist = db.wishlist.filter(w => !(w.memberId === req.member.id && w.movieId === movieId));
  res.status(204).end();
});

app.use('/api', (req, res) => res.status(404).json({ error: `ไม่มี endpoint ${req.method} ${req.originalUrl}` }));

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`MovieHub mock backend พร้อมที่ http://localhost:${PORT}`);
  console.log('บัญชีทดลอง: demo@moviehub.test / 1234 (member), admin@moviehub.test / 1234 (admin)   (ข้อมูลทั้งหมดหายเมื่อปิด)');
});
