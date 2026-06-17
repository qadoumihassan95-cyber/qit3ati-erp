import axios from 'axios';
import { useAuth } from '@/hooks/useAuth';

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001/api/v1',
});

api.interceptors.request.use((config) => {
  const token = useAuth.getState().token;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (r) => r,
  (err) => {
    if (err?.response?.status === 401) useAuth.getState().logout();
    return Promise.reject(err);
  },
);
