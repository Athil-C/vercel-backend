import mongoose from 'mongoose';

const activitySchema = new mongoose.Schema(
  {
    activityId: {
      type: mongoose.Schema.Types.ObjectId,
      default: () => new mongoose.Types.ObjectId()
    },
    type: { type: String, enum: ['merit', 'demerit'], required: true },
    points: { type: Number, required: true },
    reason: { type: String, required: true },
    date: { type: Date, default: Date.now }
  },
  { _id: false }
);

const studentSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    rollNumber: { type: String, required: true, unique: true, index: true },
    department: { type: String, required: true },
    batch: { type: String },
    password: { type: String, required: true }, // hashed
    totalMerit: { type: Number, default: 0 },
    totalDemerit: { type: Number, default: 0 },
    activities: { type: [activitySchema], default: [] }
  },
  { timestamps: true }
);

export default mongoose.model('Student', studentSchema);


