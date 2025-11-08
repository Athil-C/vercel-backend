import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';

import Admin from './models/Admin.js';
import Student from './models/Student.js';
import { requireAuth, requireAdmin } from './middleware/auth.js';

dotenv.config();

const app = express();
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(cookieParser());
app.use(morgan('dev'));

const PORT = process.env.PORT || 5000;

// ✅ DIRECT MongoDB connection using your URL
const MONGODB_URI =
  'mongodb+srv://athil:asdfghjkl@fest.spwf7vr.mongodb.net/?retryWrites=true&w=majority&appName=Fest';

async function connectDb() {
  try {
    await mongoose.connect(MONGODB_URI, {
      dbName: 'college-merit-demerit-system',
    });
    console.log('✅ MongoDB connected successfully');
  } catch (e) {
    console.error('❌ DB connection failed:', e);
    process.exit(1);
  }
}

connectDb();

// ================= AUTH LOGIN =================
app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password, role, studentId } = req.body;

    if (role === 'admin') {
      const admin = await Admin.findOne({ username });
      if (!admin) return res.status(401).json({ message: 'Invalid credentials' });
      const ok = await bcrypt.compare(password, admin.password);
      if (!ok) return res.status(401).json({ message: 'Invalid credentials' });
      const token = jwt.sign({ id: admin._id, role: 'admin' }, process.env.JWT_SECRET, {
        expiresIn: '7d',
      });
      return res.json({ token, role: 'admin' });
    }

    // Student login by rollNumber or _id
    const query = studentId ? { _id: studentId } : { rollNumber: username };
    const student = await Student.findOne(query);
    if (!student) return res.status(401).json({ message: 'Invalid credentials' });
    const ok = await bcrypt.compare(password, student.password);
    if (!ok) return res.status(401).json({ message: 'Invalid credentials' });
    const token = jwt.sign({ id: student._id, role: 'student' }, process.env.JWT_SECRET, {
      expiresIn: '7d',
    });
    return res.json({ token, role: 'student', studentId: student._id });
  } catch (err) {
    return res.status(500).json({ message: 'Login failed' });
  }
});

// ================= ADMIN: ADD STUDENT =================
app.post('/api/admin/add-student', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { name, rollNumber, department, batch, password } = req.body;
    const hashed = await bcrypt.hash(password, 10);
    const student = await Student.create({
      name,
      rollNumber,
      department,
      batch,
      password: hashed,
    });
    return res.status(201).json(student);
  } catch (err) {
    return res.status(400).json({ message: 'Could not add student', error: err.message });
  }
});

// ================= ADMIN: ASSIGN POINTS =================
app.post('/api/admin/assign-points', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { studentId, rollNumber, type, points, reason } = req.body;
    const numericPoints = Number(points);
    if (!Number.isFinite(numericPoints) || numericPoints <= 0) {
      return res.status(400).json({ message: 'Points must be a positive number' });
    }
    let student = null;
    if (studentId) student = await Student.findById(studentId.trim());
    if (!student && rollNumber) student = await Student.findOne({ rollNumber: rollNumber.trim() });
    if (!student) return res.status(404).json({ message: 'Student not found' });
    student.activities.push({
      activityId: new mongoose.Types.ObjectId(),
      type,
      points: numericPoints,
      reason,
      date: new Date()
    });
    if (type === 'merit') student.totalMerit += numericPoints;
    else student.totalDemerit += numericPoints;
    await student.save();
    return res.json(student);
  } catch (err) {
    return res.status(400).json({ message: 'Could not assign points', error: err.message });
  }
});

// ================= GET STUDENT =================
app.get('/api/students/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    if (req.user.role !== 'admin' && req.user.id !== id) {
      return res.status(403).json({ message: 'Forbidden' });
    }
    const student = await Student.findById(id);
    if (!student) return res.status(404).json({ message: 'Student not found' });
    return res.json(student);
  } catch (err) {
    return res.status(400).json({ message: 'Could not fetch student' });
  }
});

// ================= LEADERBOARD =================
app.get('/api/admin/leaderboard', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { department, batch, q } = req.query;
    const filter = {};
    if (department) filter.department = department;
    if (batch) filter.batch = batch;
    if (q)
      filter.$or = [
        { name: { $regex: q, $options: 'i' } },
        { rollNumber: { $regex: q, $options: 'i' } },
      ];
    const students = await Student.find(filter).lean();
    const withScore = students.map((s) => ({
      ...s,
      finalScore: (s.totalMerit || 0) - (s.totalDemerit || 0),
    }));
    withScore.sort((a, b) => b.finalScore - a.finalScore);
    return res.json(withScore);
  } catch (err) {
    return res.status(400).json({ message: 'Could not fetch leaderboard' });
  }
});

// ================= DELETE STUDENT =================
app.delete('/api/admin/students/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const deleted = await Student.findByIdAndDelete(id);
    if (!deleted) return res.status(404).json({ message: 'Student not found' });
    return res.json({ ok: true });
  } catch (err) {
    return res.status(400).json({ message: 'Could not delete student' });
  }
});

// ================= DELETE STUDENT ACTIVITY =================
app.delete(
  '/api/admin/students/:id/activities/:activityId',
  requireAuth,
  requireAdmin,
  async (req, res) => {
    try {
      const { id, activityId } = req.params;
      const { index } = req.query;
      const student = await Student.findById(id);
      if (!student) return res.status(404).json({ message: 'Student not found' });

      let activityIndex = student.activities.findIndex((act) => {
        const actId = act.activityId?.toString() || act._id?.toString();
        return actId === activityId;
      });

      if (activityIndex === -1 && index !== undefined) {
        const numericIndex = Number(index);
        if (!Number.isNaN(numericIndex)) activityIndex = numericIndex;
      }

      if (activityIndex < 0 || activityIndex >= student.activities.length) {
        return res.status(404).json({ message: 'Activity not found' });
      }

      const [removed] = student.activities.splice(activityIndex, 1);
      if (removed?.type === 'merit') student.totalMerit -= removed.points;
      if (removed?.type === 'demerit') student.totalDemerit -= removed.points;
      if (student.totalMerit < 0) student.totalMerit = 0;
      if (student.totalDemerit < 0) student.totalDemerit = 0;

      await student.save();
      return res.json(student);
    } catch (err) {
      return res.status(400).json({ message: 'Could not delete activity' });
    }
  }
);

// ================= EXPORT CSV =================
app.get('/api/admin/export/csv', requireAuth, requireAdmin, async (req, res) => {
  try {
    const students = await Student.find({}).lean();
    const rows = students.map((s) => ({
      name: s.name,
      rollNumber: s.rollNumber,
      department: s.department,
      batch: s.batch || '',
      totalMerit: s.totalMerit || 0,
      totalDemerit: s.totalDemerit || 0,
      finalScore: (s.totalMerit || 0) - (s.totalDemerit || 0),
    }));
    const header = 'name,rollNumber,department,batch,totalMerit,totalDemerit,finalScore\n';
    const body = rows
      .map((r) =>
        [r.name, r.rollNumber, r.department, r.batch, r.totalMerit, r.totalDemerit, r.finalScore].join(',')
      )
      .join('\n');
    const csv = header + body + '\n';
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="report.csv"');
    return res.send(csv);
  } catch (err) {
    return res.status(500).json({ message: 'Could not export CSV' });
  }
});

app.get('/api/health', (req, res) => res.json({ ok: true }));

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
