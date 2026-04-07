import mongoose from "mongoose";

const proxySchema = new mongoose.Schema(
  {
    ip: { type: String, required: true },
    port: { type: String, required: true },
    username: { type: String, required: true },
    password: { type: String, required: true },
    raw: { type: String, required: true }, // original "ip:port:user:pass" string
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

// Unique on ip+port to prevent duplicates
proxySchema.index({ ip: 1, port: 1 }, { unique: true });

export const Proxy =
  mongoose.models.Proxy || mongoose.model("Proxy", proxySchema);
