import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { api } from '@/lib/api';
import { useAuth } from '@/hooks/useAuth';
import { Loader2 } from 'lucide-react';

interface LoginForm { email: string; password: string; tenantSlug?: string; }

export default function LoginPage() {
  const { register, handleSubmit, formState: { errors } } = useForm<LoginForm>();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const setSession = useAuth((s) => s.setSession);
  const navigate = useNavigate();

  const onSubmit = async (data: LoginForm) => {
    setError(null); setLoading(true);
    try {
      const res = await api.post('/auth/login', data);
      setSession(res.data.accessToken, res.data.user);
      navigate('/dashboard');
    } catch (e: any) {
      setError(e?.response?.data?.message ?? 'فشل تسجيل الدخول');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary to-primary-dark p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-8">
        <div className="flex flex-col items-center mb-6">
          <div className="w-16 h-16 rounded-2xl bg-accent grid place-items-center text-white font-extrabold text-3xl mb-3">ق</div>
          <h1 className="text-2xl font-extrabold text-primary">قِطَعتي</h1>
          <p className="text-xs text-muted font-semibold mt-1">AutoParts Cloud — تسجيل الدخول</p>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div>
            <label className="block text-sm font-bold mb-1.5">البريد الإلكتروني</label>
            <input className="input" type="email" autoComplete="email" placeholder="owner@demo.qit3ati.com"
              {...register('email', { required: 'البريد مطلوب' })} />
            {errors.email && <p className="text-red-500 text-xs mt-1">{errors.email.message}</p>}
          </div>

          <div>
            <label className="block text-sm font-bold mb-1.5">كلمة المرور</label>
            <input className="input" type="password" autoComplete="current-password" placeholder="••••••••"
              {...register('password', { required: 'كلمة المرور مطلوبة', minLength: { value: 6, message: '6 أحرف على الأقل' } })} />
            {errors.password && <p className="text-red-500 text-xs mt-1">{errors.password.message}</p>}
          </div>

          <div>
            <label className="block text-sm font-bold mb-1.5 text-muted">معرّف الشركة (اختياري)</label>
            <input className="input" placeholder="demo" {...register('tenantSlug')} />
          </div>

          {error && <div className="bg-red-50 text-red-700 text-sm font-semibold px-3 py-2 rounded-lg">{error}</div>}

          <button type="submit" className="btn-primary w-full py-3" disabled={loading}>
            {loading ? <><Loader2 className="animate-spin" size={18} /> جاري الدخول…</> : 'دخول'}
          </button>
        </form>

        <p className="text-center text-xs text-muted mt-6">
          مشكلة في الدخول؟ راجع المشرف أو ادعم الفنّي.
        </p>
      </div>
    </div>
  );
}
