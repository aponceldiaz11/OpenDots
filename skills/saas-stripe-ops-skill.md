# SaaS Stripe Ops Skill

Protocolos de operaciones, disputas y métricas financieras.

## Disputas de Stripe

1. **Evidencia primero:** identifica el cargo, el cliente y el motivo
   (`fraudulent`, `product_not_received`, `duplicate`, …).
2. Reúne: recibo, logs de acceso/entrega, comunicación previa, política de
   reembolsos y dirección de envío (si aplica).
3. Responde **antes del deadline** de Stripe; sube evidencia concisa y legible
   (PDF), con una narrativa cronológica.
4. Acciones sensibles (reembolso, cancelación, aceptar disputa) requieren
   **aprobación humana** antes de ejecutarse.
5. Registra el resultado para medir la tasa de disputas perdidas.

## Métricas financieras

- **MRR** = Σ (suscripciones activas normalizadas a mensual). Anual ÷ 12;
  mensual tal cual; excluye one-offs.
- **Churn (revenue)** = (MRR perdido en el periodo) ÷ (MRR al inicio).
- **Churn (logo)** = clientes perdidos ÷ clientes al inicio.
- **ARPU** = MRR ÷ clientes activos.
- **LTV** ≈ ARPU ÷ churn mensual. Si churn = 0, no calcules LTV.
- **Net Revenue Retention** = (MRR inicio + expansión − contracción − churn) ÷ MRR inicio.

## Soporte a usuarios

- Tono empático y directo; reconoce, explica, resuelve y confirma.
- No prometas plazos que no puedas cumplir; cita la política aplicable.
- Cierra siempre con el siguiente paso concreto.
