<<<<<<< HEAD
# 🩸 GlucoTrack

App personal para registrar y analizar tus mediciones de glucosa en sangre.

## ✨ Funcionalidades

- ✅ Registro de mediciones con fecha/hora automática
- ✅ Selector de momento (antes 🍎 / después 🍏 de comer)
- ✅ Valor numérico de glucosa (2–3 cifras)
- ✅ Campo de observaciones
- ✅ Filtros por columna, búsqueda y ordenamiento
- ✅ Gráficos: evolución, por hora, por día de semana, distribución por rangos
- ✅ Exportar en PDF, XLS y PNG
- ✅ Compartir informes
- ✅ Base de datos en la nube (Supabase)

## 🚀 Cómo levantar el proyecto

### 1. Crear la base de datos en Supabase

1. Ir a [supabase.com](https://supabase.com) → **New project**
2. En el **SQL Editor**, ejecutar:

```sql
CREATE TABLE mediciones (
  id BIGSERIAL PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  momento TEXT NOT NULL,
  glucosa INTEGER NOT NULL,
  observaciones TEXT
);
```

3. Ir a **Project Settings → API** y copiar:
   - `Project URL`
   - `anon public` key

### 2. Configurar variables de entorno

Copiar `.env.example` a `.env`:

```bash
cp .env.example .env
```

Editar `.env` con tus valores de Supabase:

```
REACT_APP_SUPABASE_URL=https://tu-proyecto.supabase.co
REACT_APP_SUPABASE_ANON_KEY=tu-anon-key
```

### 3. Instalar dependencias y correr

```bash
npm install
npm start
```

## 📦 Subir a GitHub

```bash
git init
git add .
git commit -m "first commit"
git remote add origin https://github.com/TU_USUARIO/glucotrack.git
git push -u origin main
```

## ☁️ Desplegar en Vercel

1. Ir a [vercel.com](https://vercel.com) → **Add New Project**
2. Importar el repo de GitHub
3. En **Environment Variables**, agregar:
   - `REACT_APP_SUPABASE_URL`
   - `REACT_APP_SUPABASE_ANON_KEY`
4. Click **Deploy** 🎉

## 🎨 Stack

- React 18
- Supabase (base de datos PostgreSQL en la nube)
- Recharts (gráficos)
- jsPDF + jspdf-autotable (exportar PDF)
- SheetJS / xlsx (exportar Excel)
- html2canvas (exportar PNG)
- date-fns (manejo de fechas)
=======
# glucotrack
medidor de glucosa
>>>>>>> f316e0569e2468875526ad25cf11dd4803afab99
