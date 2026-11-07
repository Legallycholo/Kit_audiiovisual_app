import { Navigate, useNavigate } from "react-router-dom";
import { Button } from "../../components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../../components/ui/card";
import { useAuth } from "../../lib/auth";
import { es } from "../../lib/es";

const copy = {
  pending:
    "Tu cuenta está pendiente de aprobación. Te avisaremos cuando esté lista.",
  rejected: "Tu cuenta no fue aprobada. Si crees que es un error, contáctanos.",
  banned:
    "El acceso a tu cuenta fue bloqueado. Si crees que es un error, contáctanos.",
  deleted: "Esta cuenta fue eliminada.",
} as const;

export function AccountStatus() {
  const { account, signOut } = useAuth();
  const navigate = useNavigate();
  if (!account) return <Navigate to="/portal/login" replace />;
  const status = account.profile.account_status;
  if (status === "active") return <Navigate to="/portal" replace />;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">
          Estado de la cuenta: {es.accountStatus[status]}
        </CardTitle>
        <CardDescription>{copy[status]}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        {account.profile.status_reason && (
          <p className="text-sm">
            <span className="font-medium">Motivo: </span>
            {account.profile.status_reason}
          </p>
        )}
        <Button
          variant="outline"
          onClick={async () => {
            await signOut();
            navigate("/portal/login");
          }}
        >
          {es.nav.signOut}
        </Button>
      </CardContent>
    </Card>
  );
}
