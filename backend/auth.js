export const autenticar = (req, res, next) => {
    if (req.session?.usuario) {
        return next();
    }

    const isApiRequest = req.originalUrl.startsWith('/api/') || req.accepts('json');

    if (isApiRequest) {
        return res.status(401).json({
            sucesso: false,
            error: 'Não autorizado'
        });
    }

    return res.redirect('/inicio');
};