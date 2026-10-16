import mongoose from 'mongoose';
import config from '../config/env.config.js';
import User from '../models/user.model.js';
import logger from '../config/logger.config.js';

const connectDB = async () => {
  const dbUrlTemplate = config.mongo.uriTemplate;
  const dbPassword = config.mongo.password;
  const dbUrl = dbUrlTemplate.replace('<PASSWORD>', dbPassword);

  try {
    await mongoose.connect(dbUrl);
    logger.info('MongoDB Connected for Admin Seeder...');
  } catch (err: any) {
    logger.error(`Seeder DB Connection Error: ${err.message}`);
    process.exit(1);
  }
};

const createSuperAdmin = async () => {
  try {
    const { email, password, phone } = config.superAdmin;

    if (!email || !password) {
      logger.error(
        '❌ Missing Superadmin credentials in config.env (SUPER_ADMIN_EMAIL, SUPER_ADMIN_PASSWORD)',
      );
      process.exit(1);
    }

    const existingAdmin = await User.findOne({ email });
    if (existingAdmin) {
      logger.warn(`⚠️  Superadmin already exists: ${email}`);
      process.exit(0);
    }

    await User.create({
      firstName: 'Super',
      lastName: 'Admin',
      email: email,
      password: password,
      phoneNumber: phone || undefined,
      role: 'superadmin',
      status: 'approved',
      isEmailVerified: true,
    });

    logger.info(`✅ Superadmin created successfully! (${email})`);
    process.exit(0);
  } catch (error: any) {
    logger.error(`❌ Failed to create Superadmin: ${error.message}`);
    process.exit(1);
  }
};

const run = async () => {
  await connectDB();
  await createSuperAdmin();
};

run();
