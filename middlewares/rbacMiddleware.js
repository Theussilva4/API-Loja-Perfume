export const checkRole = (allowedRoles) => {
  return (req, res, next) => {
    // req.usuario é populado pelo authMiddleware
    if (!req.usuario || !req.usuario.tipo) {
      return res.status(403).json({ erro: "Acesso Negado: Perfil não identificado." });
    }
    
    // Verifica se o papel do usuário logado está na lista de papéis permitidos para essa rota
    if (!allowedRoles.includes(req.usuario.tipo)) {
      return res.status(403).json({ erro: "Acesso Negado: Permissão insuficiente para esta ação." });
    }
    
    next();
  };
};
