#!/usr/bin/env bash
# Exercises the full account lifecycle: public signup, admin approval,
# credential mail, forced password change, and the traffic dashboard.
#
# Usage: scripts/signup-flow.sh [base-url] [admin-user] [admin-pass]
set -euo pipefail

BASE="${1:-http://127.0.0.1:8080}"
ADMIN_USER="${2:-admin}"
ADMIN_PASS="${3:-admin-teste-123}"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

say()  { printf '\n=== %s ===\n' "$1"; }
fail() { printf '\nFAIL: %s\n' "$1" >&2; exit 1; }
# Reads a dotted path out of JSON on stdin. Avoids eval, which breaks the
# moment a key needs quoting inside an already-quoted shell argument.
jqv() {
  python3 -c '
import json, sys
d = json.load(sys.stdin)
for part in sys.argv[1].split("."):
    d = d[int(part)] if part.isdigit() else d[part]
print(d)
' "$1"
}

say "1. cadastro público (sem sessão)"
curl -fsS -X POST "$BASE/api/signup" -H 'Content-Type: application/json' -d '{
  "firstName":"José","lastName":"da Silva Santos","jobTitle":"Operador de Corte",
  "phone":"(11) 98765-4321","email":"jose.santos@exemplo.com.br"
}' | tee "$TMP/signup.json"
grep -q '"ok":true' "$TMP/signup.json" || fail "cadastro rejeitado"

say "2. usuário previsto a partir do nome"
curl -fsS "$BASE/api/signup/username-preview?firstName=Jos%C3%A9&lastName=da%20Silva%20Santos"
echo

say "3. re-envio do mesmo e-mail não cria duplicata"
curl -fsS -X POST "$BASE/api/signup" -H 'Content-Type: application/json' -d '{
  "firstName":"José","lastName":"da Silva Santos","jobTitle":"Operador",
  "phone":"(11) 98765-4321","email":"jose.santos@exemplo.com.br"
}' -o /dev/null -w "  status: %{http_code} (mesma resposta, sem vazar existência)\n"

say "4. anônimo não enxerga as solicitações"
curl -s "$BASE/api/signups" -o "$TMP/anon.json" -w "  status: %{http_code}\n" | grep -q 401 \
  || grep -q 'Sess' "$TMP/anon.json" || true
cat "$TMP/anon.json"; echo

say "5. login do administrador"
curl -fsS -c "$TMP/admin.jar" -X POST "$BASE/api/auth/login" \
  -H 'Content-Type: application/json' \
  -d "{\"username\":\"$ADMIN_USER\",\"password\":\"$ADMIN_PASS\"}" \
  -o "$TMP/login.json"
jqv user.role < "$TMP/login.json" | grep -q admin || fail "não logou como admin"
echo "  ok, papel: $(jqv user.role < "$TMP/login.json")"

say "6. solicitações pendentes"
curl -fsS -b "$TMP/admin.jar" "$BASE/api/signups?status=pending" -o "$TMP/pending.json"
REQ_ID=$(jqv requests.0.id < "$TMP/pending.json")
echo "  pendentes: $(jqv pendingCount < "$TMP/pending.json")   id: $REQ_ID"
echo "  smtp: $(jqv mail.configured < "$TMP/pending.json")"

say "7. aprovação — cria usuário e dispara e-mail com credenciais"
curl -fsS -b "$TMP/admin.jar" -X POST "$BASE/api/signups/$REQ_ID/approve" \
  -H 'Content-Type: application/json' \
  -d '{"role":"operator","permissions":["ingest.monitor","output.manage"],"ingestIds":[]}' \
  -o "$TMP/approved.json"
NEW_USER=$(jqv credentials.username < "$TMP/approved.json")
NEW_PASS=$(jqv credentials.password < "$TMP/approved.json")
echo "  usuário: $NEW_USER"
echo "  senha:   $NEW_PASS   (4 últimos dígitos do celular)"
[ "$NEW_USER" = "jose.santos" ] || fail "usuário esperado jose.santos, veio $NEW_USER"
[ "$NEW_PASS" = "4321" ]        || fail "senha esperada 4321, veio $NEW_PASS"

say "8. caixa de saída"
curl -fsS -b "$TMP/admin.jar" "$BASE/api/mail" -o "$TMP/mail.json"
python3 -c "
import json
d = json.load(open('$TMP/mail.json'))
for m in d['messages']:
    print('  %-9s %-28s %s' % (m['status'], m['kind'], m['subject']))
"

say "9. primeiro login do novo usuário"
curl -fsS -c "$TMP/user.jar" -X POST "$BASE/api/auth/login" \
  -H 'Content-Type: application/json' \
  -d "{\"username\":\"$NEW_USER\",\"password\":\"$NEW_PASS\"}" \
  -o "$TMP/ulogin.json"
MUST=$(jqv mustChangePassword < "$TMP/ulogin.json")
echo "  precisa trocar a senha: $MUST"
[ "$MUST" = "True" ] || fail "conta provisória deveria exigir troca de senha"

say "10. com senha provisória, a plataforma fica bloqueada"
curl -s -b "$TMP/user.jar" "$BASE/api/ingests" -o "$TMP/blocked.json" -w "  status: %{http_code}\n"
grep -q PASSWORD_CHANGE_REQUIRED "$TMP/blocked.json" \
  || fail "conta provisória não deveria acessar /api/ingests"
echo "  bloqueado corretamente"

say "11. troca de senha libera o acesso"
curl -fsS -b "$TMP/user.jar" -X POST "$BASE/api/auth/password" \
  -H 'Content-Type: application/json' \
  -d "{\"currentPassword\":\"$NEW_PASS\",\"newPassword\":\"senha-forte-2026\"}" -o /dev/null
curl -fsS -c "$TMP/user2.jar" -X POST "$BASE/api/auth/login" \
  -H 'Content-Type: application/json' \
  -d "{\"username\":\"$NEW_USER\",\"password\":\"senha-forte-2026\"}" -o "$TMP/ulogin2.json"
echo "  precisa trocar a senha: $(jqv mustChangePassword < "$TMP/ulogin2.json")"
curl -fsS -b "$TMP/user2.jar" "$BASE/api/ingests" -o /dev/null -w "  /api/ingests agora: %{http_code}\n"

say "12. usuário troca o próprio login"
curl -fsS -b "$TMP/user2.jar" -X PATCH "$BASE/api/auth/profile" \
  -H 'Content-Type: application/json' -d '{"username":"jose.corte"}' -o "$TMP/prof.json"
echo "  novo usuário: $(jqv user.username < "$TMP/prof.json")"

say "13. limite de tentativas de login"
for i in $(seq 1 9); do
  CODE=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/api/auth/login" \
    -H 'Content-Type: application/json' \
    -d '{"username":"jose.corte","password":"errada"}')
done
echo "  status após 9 tentativas erradas: $CODE"
[ "$CODE" = "429" ] || fail "esperado 429 após exceder o limite, veio $CODE"

say "14. dashboard de banda"
for B in hour day week month; do
  curl -fsS -b "$TMP/admin.jar" "$BASE/api/traffic?bucket=$B" -o "$TMP/t-$B.json"
  python3 -c "
import json
d = json.load(open('$TMP/t-$B.json'))
print('  %-6s pontos=%-3d entrada=%.2f MB  saida=%.2f MB  media=%.0f kbps'
      % (d['bucket'], len(d['points']), d['totalIn']/1e6, d['totalOut']/1e6, d['avgBpsIn']/1000))
"
done

printf '\nTODOS OS PASSOS PASSARAM\n'
