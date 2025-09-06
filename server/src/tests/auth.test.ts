import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { usersTable, profilesTable } from '../db/schema';
import { type RegisterInput, type LoginInput } from '../schema';
import { register, login, getCurrentUser, verifyJWT, verifyPassword } from '../handlers/auth';
import { eq } from 'drizzle-orm';

const JWT_SECRET = process.env['JWT_SECRET'] || 'development_secret_key';

// Test inputs
const testRegisterInput: RegisterInput = {
  email: 'test@example.com',
  password: 'password123',
  role: 'buyer'
};

const testLoginInput: LoginInput = {
  email: 'test@example.com',
  password: 'password123'
};

describe('auth handlers', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  describe('register', () => {
    it('should create a new user with hashed password', async () => {
      const result = await register(testRegisterInput);

      // Verify user properties
      expect(result.email).toBe('test@example.com');
      expect(result.role).toBe('buyer');
      expect(result.id).toBeDefined();
      expect(result.created_at).toBeInstanceOf(Date);
      expect(result.updated_at).toBeInstanceOf(Date);
      expect('password_hash' in result).toBe(false); // Should not include password hash
    });

    it('should save user to database with hashed password', async () => {
      const result = await register(testRegisterInput);

      // Query database for user
      const users = await db.select()
        .from(usersTable)
        .where(eq(usersTable.id, result.id))
        .execute();

      expect(users).toHaveLength(1);
      const savedUser = users[0];
      expect(savedUser.email).toBe('test@example.com');
      expect(savedUser.role).toBe('buyer');
      expect(savedUser.password_hash).toBeDefined();
      expect(savedUser.password_hash).not.toBe('password123'); // Should be hashed

      // Verify password is properly hashed
      const isValidHash = verifyPassword('password123', savedUser.password_hash);
      expect(isValidHash).toBe(true);
    });

    it('should create associated profile record', async () => {
      const result = await register(testRegisterInput);

      // Query database for profile
      const profiles = await db.select()
        .from(profilesTable)
        .where(eq(profilesTable.user_id, result.id))
        .execute();

      expect(profiles).toHaveLength(1);
      const profile = profiles[0];
      expect(profile.user_id).toBe(result.id);
      expect(parseFloat(profile.rating)).toBe(0);
      expect(profile.verification_status).toBe('none');
      expect(profile.payout_info_json).toBeNull();
    });

    it('should handle different user roles', async () => {
      const sellerInput: RegisterInput = {
        email: 'seller@example.com',
        password: 'password123',
        role: 'seller'
      };

      const result = await register(sellerInput);
      expect(result.role).toBe('seller');

      const adminInput: RegisterInput = {
        email: 'admin@example.com',
        password: 'password123',
        role: 'admin'
      };

      const adminResult = await register(adminInput);
      expect(adminResult.role).toBe('admin');
    });

    it('should throw error for duplicate email', async () => {
      await register(testRegisterInput);

      // Try to register same email again
      await expect(register(testRegisterInput))
        .rejects.toThrow();
    });
  });

  describe('login', () => {
    beforeEach(async () => {
      // Create a test user before each login test
      await register(testRegisterInput);
    });

    it('should authenticate valid credentials', async () => {
      const result = await login(testLoginInput);

      expect(result.user.email).toBe('test@example.com');
      expect(result.user.role).toBe('buyer');
      expect(result.user.id).toBeDefined();
      expect('password_hash' in result.user).toBe(false); // Should not include password hash
      expect(result.token).toBeDefined();
      expect(typeof result.token).toBe('string');
    });

    it('should generate valid JWT token', async () => {
      const result = await login(testLoginInput);

      // Verify JWT token can be decoded
      const decoded = verifyJWT(result.token, JWT_SECRET);
      expect(decoded.userId).toBe(result.user.id);
      expect(decoded.email).toBe('test@example.com');
      expect(decoded.role).toBe('buyer');
      expect(decoded.exp).toBeDefined(); // Should have expiration
      expect(decoded.iat).toBeDefined(); // Should have issued at
    });

    it('should reject invalid email', async () => {
      const invalidInput: LoginInput = {
        email: 'nonexistent@example.com',
        password: 'password123'
      };

      await expect(login(invalidInput))
        .rejects.toThrow(/invalid email or password/i);
    });

    it('should reject invalid password', async () => {
      const invalidInput: LoginInput = {
        email: 'test@example.com',
        password: 'wrongpassword'
      };

      await expect(login(invalidInput))
        .rejects.toThrow(/invalid email or password/i);
    });

    it('should handle case-sensitive email matching', async () => {
      const uppercaseInput: LoginInput = {
        email: 'TEST@EXAMPLE.COM',
        password: 'password123'
      };

      await expect(login(uppercaseInput))
        .rejects.toThrow(/invalid email or password/i);
    });
  });

  describe('getCurrentUser', () => {
    let testUserId: string;

    beforeEach(async () => {
      // Create a test user and get their ID
      const user = await register(testRegisterInput);
      testUserId = user.id;
    });

    it('should return user details for valid ID', async () => {
      const result = await getCurrentUser(testUserId);

      expect(result.id).toBe(testUserId);
      expect(result.email).toBe('test@example.com');
      expect(result.role).toBe('buyer');
      expect(result.created_at).toBeInstanceOf(Date);
      expect(result.updated_at).toBeInstanceOf(Date);
      expect('password_hash' in result).toBe(false); // Should not include password hash
    });

    it('should throw error for non-existent user ID', async () => {
      const nonExistentId = '00000000-0000-0000-0000-000000000000';

      await expect(getCurrentUser(nonExistentId))
        .rejects.toThrow(/user not found/i);
    });

    it('should throw error for invalid UUID format', async () => {
      const invalidId = 'invalid-uuid';

      await expect(getCurrentUser(invalidId))
        .rejects.toThrow();
    });
  });

  describe('password hashing', () => {
    it('should verify correct password', async () => {
      const user = await register(testRegisterInput);
      
      // Get the stored hash from database
      const users = await db.select()
        .from(usersTable)
        .where(eq(usersTable.id, user.id))
        .execute();
      
      const storedHash = users[0].password_hash;
      
      // Verify correct password
      expect(verifyPassword('password123', storedHash)).toBe(true);
      
      // Verify incorrect password
      expect(verifyPassword('wrongpassword', storedHash)).toBe(false);
    });
  });

  describe('integration tests', () => {
    it('should complete full auth flow: register -> login -> getCurrentUser', async () => {
      // Register
      const registerResult = await register(testRegisterInput);
      expect(registerResult.email).toBe('test@example.com');

      // Login
      const loginResult = await login(testLoginInput);
      expect(loginResult.user.id).toBe(registerResult.id);
      expect(loginResult.token).toBeDefined();

      // Get current user
      const currentUser = await getCurrentUser(registerResult.id);
      expect(currentUser.id).toBe(registerResult.id);
      expect(currentUser.email).toBe('test@example.com');
      expect(currentUser.role).toBe('buyer');
    });

    it('should handle multiple users with different roles', async () => {
      // Create buyer
      const buyer = await register({
        email: 'buyer@example.com',
        password: 'password123',
        role: 'buyer'
      });

      // Create seller
      const seller = await register({
        email: 'seller@example.com',
        password: 'password123',
        role: 'seller'
      });

      // Login as buyer
      const buyerLogin = await login({
        email: 'buyer@example.com',
        password: 'password123'
      });

      // Login as seller
      const sellerLogin = await login({
        email: 'seller@example.com',
        password: 'password123'
      });

      expect(buyerLogin.user.role).toBe('buyer');
      expect(sellerLogin.user.role).toBe('seller');
      expect(buyerLogin.user.id).toBe(buyer.id);
      expect(sellerLogin.user.id).toBe(seller.id);
    });

    it('should create unique profiles for each user', async () => {
      // Create multiple users
      const user1 = await register({
        email: 'user1@example.com',
        password: 'password123',
        role: 'buyer'
      });

      const user2 = await register({
        email: 'user2@example.com',
        password: 'password123',
        role: 'seller'
      });

      // Verify both have profiles
      const profiles = await db.select()
        .from(profilesTable)
        .execute();

      expect(profiles).toHaveLength(2);
      
      const profile1 = profiles.find(p => p.user_id === user1.id);
      const profile2 = profiles.find(p => p.user_id === user2.id);
      
      expect(profile1).toBeDefined();
      expect(profile2).toBeDefined();
      expect(profile1!.user_id).toBe(user1.id);
      expect(profile2!.user_id).toBe(user2.id);
    });
  });
});