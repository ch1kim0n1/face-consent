import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../AuthContext";

export function IncomingPoller() {
  const { user } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!user) return;
    const tick = async () => {
      try {
        const { request } = await api.incomingConsent();
        if (request) navigate(`/incoming/${request.id}`, { replace: false });
      } catch {
        /* ignore */
      }
    };
    const id = window.setInterval(tick, 1500);
    void tick();
    return () => clearInterval(id);
  }, [user, navigate]);

  return null;
}
