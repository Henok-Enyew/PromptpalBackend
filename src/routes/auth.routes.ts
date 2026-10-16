import { Router } from 'express';
import {
  registerHandler,
  verifyEmailHandler,
  loginHandler,
  forgotPasswordHandler,
  resetPasswordHandler,
  updatePasswordHandler,
  googleAuthHandler,
  logoutHandler,
  checkAuthHandler,
} from '../controllers/auth.controller.js';
import { validate } from '../middleware/validate.middleware.js';
import {
  registerUserSchema,
  verifyEmailSchema,
  loginUserSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  resetPasswordTokenSchema,
  updatePasswordSchema,
  googleAuthSchema,
} from '../validation/auth.schema.js';
import { protect } from '../middleware/auth.middleware.js';
import { authLimiter } from '../middleware/rateLimit.middleware.js';

const router = Router();

/**
 * @swagger
 * /auth/register:
 *   post:
 *     summary: Register a new user
 *     tags: [Authentication]
 *     description: Create a new user account with email and password. A verification email will be sent. Phone number is optional.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - firstName
 *               - lastName
 *               - email
 *               - password
 *               - passwordConfirm
 *             properties:
 *               firstName:
 *                 type: string
 *                 minLength: 2
 *                 maxLength: 50
 *                 description: User's first name (will be capitalized)
 *                 example: John
 *               lastName:
 *                 type: string
 *                 minLength: 2
 *                 maxLength: 50
 *                 description: User's last name (will be capitalized)
 *                 example: Doe
 *               email:
 *                 type: string
 *                 format: email
 *                 description: Valid email address (will be lowercased)
 *                 example: john.doe@example.com
 *               phoneNumber:
 *                 type: string
 *                 pattern: "^[0-9]{7,15}$"
 *                 description: Optional phone number with 7-15 digits only. Can be omitted.
 *                 example: "0911234567"
 *               password:
 *                 type: string
 *                 format: password
 *                 minLength: 8
 *                 description: Must contain at least 1 uppercase letter, 1 lowercase letter, and 1 number (minimum 8 characters)
 *                 example: Password123
 *               passwordConfirm:
 *                 type: string
 *                 format: password
 *                 description: Must match password
 *                 example: Password123!
 *     responses:
 *       201:
 *         description: Account created successfully, verification email sent (no user object or token returned)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: success
 *                 message:
 *                   type: string
 *                   example: Account created. Please check your email to verify your account.
 *       400:
 *         description: Validation error (invalid input, passwords don't match, or user already exists)
 */
router.post(
  '/register',
  authLimiter,
  validate(registerUserSchema),
  registerHandler,
);

/**
 * @swagger
 * /auth/verify-email:
 *   get:
 *     summary: Verify email address
 *     tags: [Authentication]
 *     description: Verify user's email address using the token sent via email. This endpoint uses QUERY PARAMETERS.
 *     parameters:
 *       - in: query
 *         name: token
 *         required: true
 *         schema:
 *           type: string
 *         description: Email verification token received via email
 *         example: a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6
 *     responses:
 *       200:
 *         description: Email verified successfully - user can now log in
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: success
 *                 message:
 *                   type: string
 *                   example: Email verified successfully. You can now log in.
 *       400:
 *         description: Invalid or expired verification token
 */
router.get(
  '/verify-email',
  validate(verifyEmailSchema, 'query'),
  verifyEmailHandler,
);

/**
 * @swagger
 * /auth/login:
 *   post:
 *     summary: Login user
 *     tags: [Authentication]
 *     description: Authenticate user with email and password. Returns user object and sets JWT cookie.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 description: User's email address
 *                 example: john.doe@example.com
 *               password:
 *                 type: string
 *                 format: password
 *                 description: User's password
 *                 example: Password123!
 *     responses:
 *       200:
 *         description: Login successful - JWT token set as httpOnly cookie and user object returned
 *         headers:
 *           Set-Cookie:
 *             description: JWT authentication token (httpOnly, secure in production, 90 days expiry)
 *             schema:
 *               type: string
 *               example: jwt=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...; Path=/; HttpOnly; Secure; SameSite=None; Max-Age=7776000
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
 *         description: Validation error or invalid credentials
 *       401:
 *         description: Email not verified or incorrect password
 */
router.post(
  '/login',
  authLimiter,
  validate(loginUserSchema, 'body'),
  loginHandler,
);

/**
 * @swagger
 * /auth/forgot-password:
 *   post:
 *     summary: Request password reset
 *     tags: [Authentication]
 *     description: Request a password reset link. Email will be sent if account exists (security best practice - always returns success).
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 description: Email address of the account
 *                 example: john.doe@example.com
 *     responses:
 *       200:
 *         description: Success response (always returns this message for security, regardless of whether email exists)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: success
 *                 message:
 *                   type: string
 *                   example: If an account with that email exists, a reset link has been sent.
 *       400:
 *         description: Validation error (invalid email format)
 */
router.post(
  '/forgot-password',
  authLimiter,
  validate(forgotPasswordSchema, 'body'),
  forgotPasswordHandler,
);

/**
 * @swagger
 * /auth/reset-password/{token}:
 *   patch:
 *     summary: Reset password
 *     tags: [Authentication]
 *     description: Reset user password using the token sent via email. This endpoint has BOTH path parameter (:token) AND request body.
 *     parameters:
 *       - in: path
 *         name: token
 *         required: true
 *         schema:
 *           type: string
 *         description: Password reset token received via email
 *         example: a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - password
 *               - passwordConfirm
 *             properties:
 *               password:
 *                 type: string
 *                 format: password
 *                 minLength: 8
 *                 description: New password (must contain at least 1 uppercase letter, 1 lowercase letter, and 1 number, minimum 8 characters)
 *                 example: NewPassword123!
 *               passwordConfirm:
 *                 type: string
 *                 format: password
 *                 description: Must match password
 *                 example: NewPassword123!
 *     responses:
 *       200:
 *         description: Password reset successfully - user can now log in with new password
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: success
 *                 message:
 *                   type: string
 *                   example: Password reset successfully. You can now log in with your new password.
 *       400:
 *         description: Invalid or expired token, or validation error (passwords don't match, password too weak)
 */
router.patch(
  '/reset-password/:token',
  authLimiter,
  validate(resetPasswordTokenSchema, 'params'),
  validate(resetPasswordSchema, 'body'),
  resetPasswordHandler,
);

/**
 * @swagger
 * /auth/update-password:
 *   patch:
 *     summary: Update password
 *     tags: [Authentication]
 *     description: Update current user's password (requires authentication)
 *     security:
 *       - cookieAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - currentPassword
 *               - password
 *               - confirmPassword
 *             properties:
 *               currentPassword:
 *                 type: string
 *                 format: password
 *                 example: OldPassword123!
 *               password:
 *                 type: string
 *                 format: password
 *                 minLength: 8
 *                 example: NewPassword123!
 *               confirmPassword:
 *                 type: string
 *                 format: password
 *                 example: NewPassword123!
 *     responses:
 *       200:
 *         description: Password updated successfully
 *       400:
 *         description: Current password is incorrect
 *       401:
 *         description: Unauthorized
 */
router.patch(
  '/update-password',
  protect,
  authLimiter,
  validate(updatePasswordSchema, 'body'),
  updatePasswordHandler,
);

/**
 * @swagger
 * /auth/me:
 *   get:
 *     summary: Get current user
 *     tags: [Authentication]
 *     description: Retrieve the authenticated user's information. Requires JWT authentication cookie.
 *     security:
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: Successfully retrieved current user information
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
 *                       type: object
 *                       properties:
 *                         id:
 *                           type: string
 *                           description: User ID
 *                           example: 507f1f77bcf86cd799439011
 *                         email:
 *                           type: string
 *                           format: email
 *                           description: User's email
 *                           example: john.doe@example.com
 *                         role:
 *                           type: string
 *                           enum: [user, admin, superadmin]
 *                           description: User's role
 *                           example: user
 *                         fullName:
 *                           type: string
 *                           description: User's full name (firstName + lastName)
 *                           example: John Doe
 *                         profileImage:
 *                           type: string
 *                           description: URL to user's profile image
 *                           example: https://res.cloudinary.com/dxhkryxzk/image/upload/v1755980278/avatar2_bkwawy.png
 *       401:
 *         description: Unauthorized - No valid JWT cookie found or token expired
 */
router.get('/me', protect, checkAuthHandler);

/**
 * @swagger
 * /auth/google:
 *   post:
 *     summary: Google OAuth login
 *     tags: [Authentication]
 *     description: Authenticate user using Google OAuth
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - code
 *             properties:
 *               code:
 *                 type: string
 *                 description: Google OAuth authorization code
 *                 example: 4/0AY0e-g7...
 *     responses:
 *       200:
 *         description: Google authentication successful
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
 *         description: Invalid authorization code
 */
router.post(
  '/google',
  authLimiter,
  validate(googleAuthSchema, 'body'),
  googleAuthHandler,
);

/**
 * @swagger
 * /auth/logout:
 *   post:
 *     summary: Logout user
 *     tags: [Authentication]
 *     description: Clear authentication cookie and logout user
 *     responses:
 *       200:
 *         description: Logout successful
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: success
 *                 message:
 *                   type: string
 *                   example: Logged out successfully
 */
router.post('/logout', logoutHandler);

export default router;
