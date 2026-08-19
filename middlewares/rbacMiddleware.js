export const checkRole = (allowedRoles) => {
  return (req, res, next) => {
    // req.usuario Ã© populado pelo authMiddleware
    if (!req.usuario || !req.usuario.tipo) {
      return res.status(403).json({ erro: "Acesso Negado: Perfil nÃ£o identificado." });
    }
    
    // Verifica se o papel do usuÃ¡rio logado estÃ¡ na lista de papÃ©is permitidos para essa rota
    if (!allowedRoles.includes(req.usuario.tipo)) {
      return res.status(403).json({ erro: "Acesso Negado: PermissÃ£o insuficiente para esta aÃ§Ã£o." });
    }
    
    next();
  };
};
