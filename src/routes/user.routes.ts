import { Router } from 'express';
import { protect } from '../middleware/auth.middleware.js';
import { authLimiter } from '../middleware/rateLimit.middleware.js';
import {
  userProfile,
  updateProfileHandler,
  deleteMeHandler,
} from '../controllers/user.controller.js';
import {
  updateMeSchema,
  deleteAccountSchema,
} from '../validation/user.schema.js';
import { validate } from '../middleware/validate.middleware.js';
import { upload } from '../utils/fileUpload.util.js';

const router = Router();

/**
 * @swagger
 * /user/userProfile:
 *   get:
 *     summary: Get my profile
 *     tags: [Users]
 *     description: Retrieve the authenticated user's complete profile information including personal details, verification status, and role.
 *     security:
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: Successfully retrieved user profile
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: success
 *                 data:
 *                   type: object
 *                   properties:
 *                     user:
 *                       $ref: '#/components/schemas/User'
 *       401:
 *         description: Unauthorized - valid JWT cookie required
 */
router.get('/userProfile', protect, userProfile);

/**
 * @swagger
 * /user/updateProfile:
 *   patch:
 *     summary: Update my profile
 *     tags: [Users]
 *     description: Update the authenticated user's profile information. ALL fields are optional - only send the fields you want to update. Names are automatically sanitized and capitalized. Profile image can be uploaded as a file. Sensitive fields (password, role, status, etc.) are automatically filtered out if sent. Old profile images are automatically deleted from Cloudinary when a new one is uploaded.
 *     security:
 *       - cookieAuth: []
 *     requestBody:
 *       required: false
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               firstName:
 *                 type: string
 *                 minLength: 2
 *                 maxLength: 50
 *                 description: User's first name (optional, automatically capitalized)
 *                 example: John
 *               lastName:
 *                 type: string
 *                 minLength: 2
 *                 maxLength: 50
 *                 description: User's last name (optional, automatically capitalized)
 *                 example: Doe
 *               phoneNumber:
 *                 type: string
 *                 pattern: '^[0-9]{7,15}$'
 *                 description: Phone number with 7-15 digits only, no special characters (optional)
 *                 example: "251911234567"
 *               profileImage:
 *                 type: string
 *                 format: binary
 *                 description: Profile image file (optional, accepts jpg, jpeg, png, webp, max 5MB)
 *     responses:
 *       200:
 *         description: Profile updated successfully with the updated user object
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: success
 *                 data:
 *                   type: object
 *                   properties:
 *                     user:
 *                       $ref: '#/components/schemas/User'
 *       400:
 *         description: Bad request - validation error (invalid phone format, name too short/long, invalid image format, etc.)
 *       401:
 *         description: Unauthorized - valid JWT cookie required
 */
router.patch('/updateProfile', protect, upload.single('profileImage'), validate(updateMeSchema), updateProfileHandler);

/**
 * @swagger
 * /user/me:
 *   delete:
 *     summary: Delete the current user's account
 *     tags: [User]
 *     description: Soft-deletes the user's prompts and comments, removes optimizer history and anonymizes the account. Email/password accounts must confirm with their password.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [confirm]
 *             properties:
 *               password:
 *                 type: string
 *               confirm:
 *                 type: string
 *                 enum: [DELETE]
 *     responses:
 *       200:
 *         description: Account deleted
 *       401:
 *         description: Not logged in or incorrect password
 */
router.delete(
  '/me',
  protect,
  authLimiter,
  validate(deleteAccountSchema),
  deleteMeHandler,
);

export default router;
