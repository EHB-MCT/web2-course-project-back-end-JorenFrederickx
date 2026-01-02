const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
	{
		email: {
			type: String,
			required: true,
			unique: true,
			lowercase: true,
			trim: true,
		},
		passwordHash: { type: String, required: true },
		name: { type: String, default: "" },
		profilePictureUrl: { type: String, default: "" },
	},
	{ timestamps: true }
);

const User = mongoose.model("User", userSchema);
module.exports = User;
