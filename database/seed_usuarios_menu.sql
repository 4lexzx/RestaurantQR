-- Seed usuarios de prueba MenuGo (credenciales por defecto del frontend)
INSERT INTO administrador (usuario, clave, nombrecompleto, correo, estado)
VALUES (
  'admin',
  '$2b$10$8BKGrY9M9ggLPAJ38OO/0.Al9YNwr6mneX9ZIjjlnQt5kAKG5PRDm',
  'Administrador MenuGo',
  'Admin@MenuGo.com',
  true
)
ON CONFLICT (usuario) DO NOTHING;

INSERT INTO trabajador
  (nombres, apellidos, documento, telefono, correo, rol, estado, fechainiciocontrato, observaciones, usuario_acceso, clave_acceso)
VALUES
  ('Mesero', 'MenuGo', '12345678', '987654321', 'Mesero@MenuGo.com', 'Mesero', 'Activo', CURRENT_DATE, 'Cuenta de prueba', 'Mesero@MenuGo.com', '$2b$10$bMRjGv6SbCk9i.UHsvzT.uui.P835YJeva/23JVOEQ.2N.2Y8SCxC'),
  ('Cocina', 'MenuGo', '87654321', '912345678', 'Cocina@MenuGo.com', 'Cocina', 'Activo', CURRENT_DATE, 'Cuenta de prueba', 'Cocina@MenuGo.com', '$2b$10$dKQGV65lb7KD6hu6b42VBeLtObRXQGSNo7stjhgQgu5PYsut9dEE2')
ON CONFLICT (documento) DO NOTHING;