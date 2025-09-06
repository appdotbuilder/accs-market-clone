import { createHash, randomBytes, pbkdf2Sync } from 'crypto';
import { db } from '../db';
import { usersTable, profilesTable } from '../db/schema';
import { type RegisterInput, type LoginInput, type User } from '../schema';
import { eq } from 'drizzle-orm';

const JWT_SECRET = process.env['JWT_SECRET'] || 'development_secret_key';
const SALT_LENGTH = 32;
const ITERATIONS = 100000;

// Simple JWT implementation
function createJWT(payload: Record<string, any>, secret: string, expiresIn: string = '24h'): string {
  const header = { alg: 'HS256', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const expirationSeconds = expiresIn === '24h' ? 24 * 60 * 60 : 3600;
  
  const jwtPayload = {
    ...payload,
    iat: now,
    exp: now + expirationSeconds
  };

  const headerB64 = Buffer.from(JSON.stringify(header)).toString('base64url');
  const payloadB64 = Buffer.from(JSON.stringify(jwtPayload)).toString('base64url');
  
  const signature = createHash('sha256')
    .update(`${headerB64}.${payloadB64}.${secret}`)
    .digest('base64url');

  return `${headerB64}.${payloadB64}.${signature}`;
}

function verifyJWT(token: string, secret: string): any {
  const [headerB64, payloadB64, signature] = token.split('.');
  if (!headerB64 || !payloadB64 || !signature) {
    throw new Error('Invalid token format');
  }

  const expectedSignature = createHash('sha256')
    .update(`${headerB64}.${payloadB64}.${secret}`)
    .digest('base64url');

  if (signature !== expectedSignature) {
    throw new Error('Invalid token signature');
  }

  const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString());
  
  if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
    throw new Error('Token expired');
  }

  return payload;
}

function hashPassword(password: string): string {
  const salt = randomBytes(SALT_LENGTH).toString('hex');
  const hash = pbkdf2Sync(password, salt, ITERATIONS, 64, 'sha256').toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password: string, storedHash: string): boolean {
  const [salt, hash] = storedHash.split(':');
  if (!salt || !hash) return false;
  
  const computedHash = pbkdf2Sync(password, salt, ITERATIONS, 64, 'sha256').toString('hex');
  return hash === computedHash;
}

export async function register(input: RegisterInput): Promise<User> {
  try {
    // Hash the password
    const password_hash = hashPassword(input.password);
    
    // Create user record
    const userResult = await db.insert(usersTable)
      .values({
        email: input.email,
        password_hash,
        role: input.role
      })
      .returning()
      .execute();

    const user = userResult[0];

    // Create associated profile record
    await db.insert(profilesTable)
      .values({
        user_id: user.id,
        rating: '0',
        verification_status: 'none'
      })
      .execute();

    // Return user without password hash
    return {
      id: user.id,
      email: user.email,
      role: user.role,
      created_at: user.created_at,
      updated_at: user.updated_at
    } as User;
  } catch (error) {
    console.error('User registration failed:', error);
    throw error;
  }
}

export async function login(input: LoginInput): Promise<{ user: User; token: string }> {
  try {
    // Find user by email
    const users = await db.select()
      .from(usersTable)
      .where(eq(usersTable.email, input.email))
      .execute();

    if (users.length === 0) {
      throw new Error('Invalid email or password');
    }

    const user = users[0];

    // Verify password
    const isPasswordValid = verifyPassword(input.password, user.password_hash);
    if (!isPasswordValid) {
      throw new Error('Invalid email or password');
    }

    // Generate JWT token
    const token = createJWT(
      { userId: user.id, email: user.email, role: user.role },
      JWT_SECRET,
      '24h'
    );

    // Return user without password hash and token
    return {
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        created_at: user.created_at,
        updated_at: user.updated_at
      } as User,
      token
    };
  } catch (error) {
    console.error('User login failed:', error);
    throw error;
  }
}

export async function getCurrentUser(userId: string): Promise<User> {
  try {
    // Fetch user details from database
    const users = await db.select()
      .from(usersTable)
      .where(eq(usersTable.id, userId))
      .execute();

    if (users.length === 0) {
      throw new Error('User not found');
    }

    const user = users[0];

    // Return user without password hash
    return {
      id: user.id,
      email: user.email,
      role: user.role,
      created_at: user.created_at,
      updated_at: user.updated_at
    } as User;
  } catch (error) {
    console.error('Get current user failed:', error);
    throw error;
  }
}

// Export utility functions for testing
export { createJWT, verifyJWT, hashPassword, verifyPassword };