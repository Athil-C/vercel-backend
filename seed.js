import dotenv from 'dotenv';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import Admin from './models/Admin.js';
import Student from './models/Student.js';

dotenv.config();

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI not set');
  await mongoose.connect(uri, { dbName: 'college-merit-demerit-system' });

  // Create default admin if not exists
  const adminUsername = 'admin';
  const adminPass = 'admin123';
  const existingAdmin = await Admin.findOne({ username: adminUsername });
  if (!existingAdmin) {
    const hash = await bcrypt.hash(adminPass, 10);
    await Admin.create({ username: adminUsername, password: hash });
    // eslint-disable-next-line no-console
    console.log('Created default admin: admin / admin123');
  } else {
    // eslint-disable-next-line no-console
    console.log('Admin already exists');
  }

  // Seed some students
  const students = [
    { name: 'Alice Thomas', rollNumber: 'CS23-001', department: 'CSE', batch: '2023', password: 'alice@123' },
    { name: 'Bob Mathew', rollNumber: 'CS23-002', department: 'CSE', batch: '2023', password: 'bob@123' },
    { name: 'Catherine Roy', rollNumber: 'EE23-010', department: 'EEE', batch: '2023', password: 'cathy@123' }
  ];

  for (const s of students) {
    const exists = await Student.findOne({ rollNumber: s.rollNumber });
    if (!exists) {
      const hash = await bcrypt.hash(s.password, 10);
      await Student.create({ ...s, password: hash });
      // eslint-disable-next-line no-console
      console.log('Created student', s.rollNumber);
    }
  }

  // add some sample activities
  const alice = await Student.findOne({ rollNumber: 'CS23-001' });
  if (alice && alice.activities.length === 0) {
    alice.activities.push({
      activityId: new mongoose.Types.ObjectId(),
      type: 'merit',
      points: 10,
      reason: 'Helped organize event',
      date: new Date()
    });
    alice.totalMerit += 10;
    await alice.save();
  }
  const bob = await Student.findOne({ rollNumber: 'CS23-002' });
  if (bob && bob.activities.length === 0) {
    bob.activities.push({
      activityId: new mongoose.Types.ObjectId(),
      type: 'demerit',
      points: 3,
      reason: 'Late to class',
      date: new Date()
    });
    bob.totalDemerit += 3;
    await bob.save();
  }

  // eslint-disable-next-line no-console
  console.log('Seeding complete');
  await mongoose.disconnect();
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error(e);
  process.exit(1);
});


