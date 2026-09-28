import { describe, it, expect, vi } from 'vitest';
import { authMiddleware } from '../auth.middleware';
import { JwtService } from '../../services/jwt.service';

vi.mock('../../services/jwt.service', () => ({
  JwtService: {
    verify: vi.fn()
  }
}));

describe('authMiddleware', () => {
  it('should throw UnauthorizedError if auth header is missing', async () => {
    const request = { headers: {} } as any;
    const reply = {} as any;

    await expect(authMiddleware(request, reply)).rejects.toThrow('Unauthorized');
  });

  it('should set request.user if token is valid', async () => {
    const request = { headers: { authorization: 'Bearer valid-token' } } as any;
    const reply = {} as any;
    
    vi.mocked(JwtService.verify).mockReturnValue({ id: 'user1' });

    await authMiddleware(request, reply);
    expect(request.user).toEqual({ id: 'user1' });
  });
});
