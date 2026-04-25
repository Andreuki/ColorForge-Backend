const Paint = require('../models/Paint');

const HEX_COLOR_REGEX = /^#[0-9A-Fa-f]{6}$/;

const getUserPaints = async (req, res) => {
  try {
    const paints = await Paint.find({ userId: req.user._id }).sort({ brand: 1, name: 1 });
    res.status(200).json(paints);
  } catch (error) {
    res.status(500).json({ message: 'Error al obtener pinturas', error: error.message });
  }
};

const createUserPaint = async (req, res) => {
  try {
    const { name, brand, hexColor, line = '', isCustom = false, notes = '' } = req.body;

    if (!name || typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ message: 'El nombre es obligatorio' });
    }

    if (!brand || typeof brand !== 'string' || !brand.trim()) {
      return res.status(400).json({ message: 'La marca es obligatoria' });
    }

    if (!hexColor || typeof hexColor !== 'string' || !HEX_COLOR_REGEX.test(hexColor)) {
      return res.status(400).json({ message: 'hexColor debe tener formato #RRGGBB' });
    }

    const paint = await Paint.create({
      userId: req.user._id,
      name: name.trim(),
      brand: brand.trim(),
      hexColor,
      line: typeof line === 'string' ? line.trim() : '',
      isCustom: Boolean(isCustom),
      notes: typeof notes === 'string' ? notes : ''
    });

    res.status(201).json(paint);
  } catch (error) {
    res.status(500).json({ message: 'Error al crear pintura', error: error.message });
  }
};

const addPaint = createUserPaint;

const deleteUserPaint = async (req, res) => {
  try {
    const paint = await Paint.findOne({ _id: req.params.id, userId: req.user._id });

    if (!paint) {
      return res.status(404).json({ message: 'Pintura no encontrada' });
    }

    await Paint.deleteOne({ _id: paint._id });
    res.status(200).json({ message: 'Pintura eliminada' });
  } catch (error) {
    res.status(500).json({ message: 'Error al eliminar pintura', error: error.message });
  }
};

const updateUserPaint = async (req, res) => {
  try {
    const paint = await Paint.findOne({ _id: req.params.id, userId: req.user._id });

    if (!paint) {
      return res.status(404).json({ message: 'Pintura no encontrada' });
    }

    const updates = {};

    if (req.body.notes !== undefined) {
      updates.notes = typeof req.body.notes === 'string' ? req.body.notes : '';
    }

    if (req.body.hexColor !== undefined) {
      if (!paint.isCustom) {
        return res.status(400).json({ message: 'Solo se puede cambiar hexColor en pinturas personalizadas' });
      }

      if (typeof req.body.hexColor !== 'string' || !HEX_COLOR_REGEX.test(req.body.hexColor)) {
        return res.status(400).json({ message: 'hexColor debe tener formato #RRGGBB' });
      }

      updates.hexColor = req.body.hexColor;
    }

    const updated = await Paint.findByIdAndUpdate(paint._id, { $set: updates }, { new: true });
    res.status(200).json(updated);
  } catch (error) {
    res.status(500).json({ message: 'Error al actualizar pintura', error: error.message });
  }
};

module.exports = {
  getUserPaints,
  addPaint,
  createUserPaint,
  deleteUserPaint,
  updateUserPaint
};
