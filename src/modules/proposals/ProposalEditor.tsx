import { uiLabel } from "../../shared/i18n";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useWorkspace } from "../../shared/store";
import { Empty } from "../../shared/ui";
import { Editor } from "./Editor";

export function ProposalEditor() {
  const { proposalId } = useParams();
  const { data, update, toast, user, mode, saving } = useWorkspace();
  const navigate = useNavigate();
  const original = data.proposals.find((p) => p.id === proposalId);
  if (!original)
    return (
      <Empty
        title={uiLabel("Proposal not found")}
        description={uiLabel("Return to proposals to select a record.")}
        action={<Link to="/proposals">{uiLabel("All proposals")}</Link>}
      />
    );
  return <Editor key={original.id} original={original} />;
}
