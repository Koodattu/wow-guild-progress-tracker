import mongoose, { Document, Schema } from "mongoose";

export interface IProcessorState extends Document {
  key: string;
  isPaused: boolean;
  updatedAt: Date;
}

const ProcessorStateSchema = new Schema<IProcessorState>(
  {
    key: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    isPaused: {
      type: Boolean,
      required: true,
      default: false,
    },
    updatedAt: {
      type: Date,
      required: true,
      default: Date.now,
    },
  },
  {
    timestamps: false,
  },
);

const ProcessorState = mongoose.model<IProcessorState>("ProcessorState", ProcessorStateSchema);
export default ProcessorState;
