# Contribuir

Gracias por ayudar. Antes de nada, lee [`docs/CONTRIBUCION.md`](docs/CONTRIBUCION.md)
(flujo Git-first, niveles de confianza, licencias) y [`docs/FUENTES.md`](docs/FUENTES.md)
(política de fuentes y atribución).

## Resumen

- **Datos**: abre un PR con el JSON v2 siguiendo [`docs/ESQUEMA-DATOS-v2.md`](docs/ESQUEMA-DATOS-v2.md).
  Toda fuente debe declararse en `sources[]` con URL y fecha de consulta.
  `node scripts/validate.js` debe quedar en **verde** (lo comprueba la CI).
- **Código**: tests con `node --test tests/`; sin dependencias nuevas sin
  justificarlo (véase [`docs/AGENTES-COSTE.md`](docs/AGENTES-COSTE.md)).
- **Nunca**: introducir secretos, credenciales ni datos personales.

## Licencia de las contribuciones

Al contribuir aceptas publicar tu aporte bajo la licencia del proyecto:

- **Código**: AGPL-3.0 (ver [`LICENSE`](LICENSE)).
- **Datos y compilación**: CC BY 4.0.
- **Fichas verbatim**: permanecen bajo la licencia de su fuente (ver [`NOTICE`](NOTICE)).
