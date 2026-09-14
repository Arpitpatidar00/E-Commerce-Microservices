import jwt from 'jsonwebtoken';

export class JwtService {
  static sign(payload: string | object | Buffer): string {
    const secret = process.env.JWT_SECRET || 'supersecret';
    return jwt.sign(payload, secret, { expiresIn: '24h' });
  }

  static verify(token: string): any {
    const secret = process.env.JWT_SECRET || 'supersecret';
    return jwt.verify(token, secret);
  }
}
