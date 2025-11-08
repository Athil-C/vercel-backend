import mongoose from 'mongoose';

const adminSchema = new mongoose.Schema(
  {
    username: { type: String, required: true, unique: true, index: true },
    password: { type: String, required: true } // hashed
  },
  { timestamps: true }
);

export default mongoose.model('Admin', adminSchema);


