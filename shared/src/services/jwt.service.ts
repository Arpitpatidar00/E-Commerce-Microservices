import jwt from 'jsonwebtoken';

export class JwtService {
  private static getSecret(): string {
    const secret = process.env.JWT_SECRET;
    if (!secret || secret.length < 32) {
      throw new Error('JWT_SECRET is missing or too weak (min 32 chars)');
    }
    return secret;
  }

  static sign(payload: string | object | Buffer): string {
    return jwt.sign(payload, this.getSecret(), { expiresIn: '24h' });
  }

  static verify(token: string): any {
    return jwt.verify(token, this.getSecret());
  }
}
