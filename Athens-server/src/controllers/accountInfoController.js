import bcrypt from "bcrypt";
import { accountInfoCollection } from "../db/mongo.js";
import {
	deleteAccountInfoByName,
	insertAccountInfo,
} from "../services/accountInfoStore.js";
import { decryptAccountDoc } from "../services/autoBidProfileSecrets.js";

function escapeRegExp(value) {
	return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export const getAccountInfo = async (req, res) => {
	try {
		console.log('GET /api/account_info - Fetching all account info');
		const accountInfo = await accountInfoCollection.find({}).toArray();
		// Don't return passwords
		const sanitized = accountInfo.map(({ password, ...rest }) => decryptAccountDoc(rest));
		res.status(200).json(sanitized);
	} catch (error) {
		console.error('Error in getAccountInfo:', error);
		res.status(500).json({ message: error.message });
	}
};

/** Single account by `name` (URL-encoded), password stripped. Used by Fox extension profile picker. */
export const getAccountInfoByName = async (req, res) => {
	try {
		const raw = req.params.name;
		const name = typeof raw === "string" ? decodeURIComponent(raw) : "";
		const trimmed = name.trim();
		if (!trimmed) {
			return res.status(400).json({ success: false, message: "Name is required" });
		}
		const doc =
			(await accountInfoCollection.findOne({ name: trimmed })) ||
			(await accountInfoCollection.findOne({
				name: { $regex: new RegExp(`^${escapeRegExp(trimmed)}$`, "i") },
			}));
		if (!doc) {
			return res.status(404).json({ success: false, message: "Account not found" });
		}
		const { password, ...rest } = doc;
		res.status(200).json({ success: true, data: decryptAccountDoc(rest) });
	} catch (error) {
		console.error("Error in getAccountInfoByName:", error);
		res.status(500).json({ success: false, message: error.message });
	}
};

export const addAccountInfo = async (req, res) => {
	try {
		const { name, password } = req.body;
		console.log('POST /api/account_info - Attempting to add name:', name);
		if (!name) {
			console.log('POST /api/account_info - Name is required (400)');
			return res.status(400).json({ message: "Name is required" });
		}
		// Check if the name already exists to prevent duplicates
		const existingName = await accountInfoCollection.findOne({ name });
		if (existingName) {
			console.log('POST /api/account_info - Name already exists (409):', name);
			return res.status(409).json({ message: "Name already exists" });
		}

		// Hash password if provided
		let hashedPassword = null;
		if (password) {
			hashedPassword = await bcrypt.hash(password, 10);
		}

		const userData = { name };
		if (hashedPassword) {
			userData.password = hashedPassword;
		}

		const result = await insertAccountInfo({ 
			name, 
			password: hashedPassword 
		});

		console.log('POST /api/auth/signup - User created successfully:', name);
		const createdUser = await accountInfoCollection.findOne({ _id: result.insertedId });
		res.status(201).json({ 
			success: true, 
			user: { _id: result.insertedId, name, tier: createdUser ? createdUser.tier : null },
			message: "User created successfully" 
		});
	} catch (error) {
		console.error('Error in signup:', error);
		res.status(500).json({ success: false, message: error.message });
	}
};

export const signin = async (req, res) => {
	try {
		const { name, password } = req.body;
		console.log('POST /api/auth/signin - Attempting to signin:', name);
		
		if (!name || !password) {
			return res.status(400).json({ success: false, message: "Name and password are required" });
		}

		// Find user by name
		const user = await accountInfoCollection.findOne({ name });
		if (!user) {
			return res.status(401).json({ success: false, message: "Invalid credentials" });
		}

		// Check if user has a password set
		if (!user.password) {
			// For users without password, check against default password
			const defaultPassword = "12345678";
			if (password !== defaultPassword) {
				return res.status(401).json({ success: false, message: "Invalid credentials" });
			}
		} else {
			// Verify password
			const isValid = await bcrypt.compare(password, user.password);
			if (!isValid) {
				return res.status(401).json({ success: false, message: "Invalid credentials" });
			}
		}

		console.log('POST /api/auth/signin - User signed in successfully:', name);
		res.status(200).json({
		success: true,
		user: { _id: user._id, name: user.name, tier: user.tier },
		message: "Signed in successfully"
	});
	} catch (error) {
		console.error('Error in signin:', error);
		res.status(500).json({ success: false, message: error.message });
	}
};

export const removeAccountInfo = async (req, res) => {
	try {
		const { name } = req.params;
		console.log('DELETE /api/account_info/:name - Attempting to remove name:', name);
		if (!name) {
			console.log('DELETE /api/account_info/:name - Name is required (400)');
			return res.status(400).json({ message: "Name is required" });
		}
		const result = await deleteAccountInfoByName(name);
		if (result.deletedCount === 0) {
			console.log('DELETE /api/account_info/:name - Name not found (404):', name);
			return res.status(404).json({ message: "Name not found" });
		}
		console.log('DELETE /api/account_info/:name - Name removed successfully:', name, 'Result:', result);
		res.status(200).json({ message: "Name removed successfully" });
	} catch (error) {
		console.error('Error in removeAccountInfo:', error);
		res.status(500).json({ message: error.message });
	}
};

export const signup = async (req, res) => {
	try {
		const { name, password } = req.body;
		console.log('POST /api/auth/signup - Attempting to signup:', name);

		if (!name || !password) {
			return res.status(400).json({ success: false, message: "Name and password are required" });
		}

		// Check if the name already exists
		const existingUser = await accountInfoCollection.findOne({ name });
		if (existingUser) {
			return res.status(409).json({ success: false, message: "User already exists" });
		}

		// Hash password
		const hashedPassword = await bcrypt.hash(password, 10);

		const result = await insertAccountInfo({
			name,
			password: hashedPassword,
		});

		console.log('POST /api/auth/signup - User created successfully:', name);
		const createdUser = await accountInfoCollection.findOne({ _id: result.insertedId });
		res.status(201).json({
			success: true,
			user: { _id: result.insertedId, name, tier: createdUser ? createdUser.tier : null },
			message: "User created successfully",
		});
	} catch (error) {
		console.error('Error in signup:', error);
		res.status(500).json({ success: false, message: error.message });
	}
};
