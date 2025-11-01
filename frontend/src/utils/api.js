const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000';

// Token management
export function getAuthToken() {
  return localStorage.getItem('authToken');
}

export function setAuthToken(token) {
  localStorage.setItem('authToken', token);
}

export function clearAuthToken() {
  localStorage.removeItem('authToken');
}

export function isAuthenticated() {
  return !!getAuthToken();
}

// Authenticated fetch wrapper
export async function authenticatedFetch(endpoint, options = {}) {
  const token = getAuthToken();
  
  const headers = {
    'Content-Type': 'application/json',
    ...options.headers,
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const url = endpoint.startsWith('http') ? endpoint : `${API_URL}${endpoint}`;

  const response = await fetch(url, {
    ...options,
    headers,
  });

  // If token expired or invalid, redirect to login
  if (response.status === 401 || response.status === 403) {
    clearAuthToken();
    window.location.href = '/login';
    throw new Error('Session expired. Please login again.');
  }

  return response;
}

// Login function
export async function login(username, password) {
  const response = await fetch(`${API_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Login failed');
  }

  const data = await response.json();
  setAuthToken(data.token);
  return data;
}

// Logout function
export async function logout() {
  try {
    // Call logout endpoint if authenticated
    if (isAuthenticated()) {
      await authenticatedFetch('/api/auth/logout', { method: 'POST' });
    }
  } catch (error) {
    console.error('Logout error:', error);
  } finally {
    clearAuthToken();
    window.location.href = '/login';
  }
}

// Verify token is still valid
export async function verifyToken() {
  try {
    const response = await authenticatedFetch('/api/auth/verify');
    if (response.ok) {
      const data = await response.json();
      return data.valid;
    }
    return false;
  } catch (error) {
    return false;
  }
}

// Export authenticated fetch as default API client
export const api = authenticatedFetch;
