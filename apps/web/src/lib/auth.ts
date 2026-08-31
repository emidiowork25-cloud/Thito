export interface User {
  id: string;
  email: string;
  name: string;
  userType: 'customer' | 'store';
}

export interface AuthResponse {
  userId: string;
  email: string;
  name: string;
  userType: 'customer' | 'store';
  token: string;
}

export function getStoredAuth(): User | null {
  if (typeof window === 'undefined') return null;

  const token = localStorage.getItem('token');
  const user = localStorage.getItem('user');

  if (!token || !user) return null;

  try {
    return JSON.parse(user);
  } catch {
    return null;
  }
}

export function setStoredAuth(auth: AuthResponse) {
  localStorage.setItem('token', auth.token);
  localStorage.setItem('user', JSON.stringify({
    id: auth.userId,
    email: auth.email,
    name: auth.name,
    userType: auth.userType,
  }));
}

export function clearStoredAuth() {
  localStorage.removeItem('token');
  localStorage.removeItem('user');
}
