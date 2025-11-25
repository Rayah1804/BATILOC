const express = require("express");
const router = express.Router();
const sequelize = require("../connection/db");
const { Op } = require("sequelize");
const MbatimentModel = require("../models/mbatiment")(sequelize, require("sequelize").DataTypes);
const Convention = require("../models/convention")(sequelize, require("sequelize").DataTypes);
const multer = require("multer");
const path = require("path");
const { validateBatiment } = require("../middleware/validator");

// Configuration de multer pour stocker les images en mémoire
const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB max
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);

    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error("Seules les images (jpeg, jpg, png, gif) sont autorisées"));
    }
  }
});

// READ - Obtenir tous les bâtiments avec pagination
router.get("/", async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;
    const { q, statut, available } = req.query;

    const where = {};
    if (statut !== undefined) {
      where.statut = statut === 'true' || statut === true;
    }
    // Recherche - Recherche dans N° Bâtiment, Adresse et Montant
    if (q) {
      const qTrimmed = q.trim();
      const isNumeric = !isNaN(qTrimmed) && qTrimmed !== '';
      const searchConditions = [];
      
      // Recherche par N° Bâtiment (numBat)
      if (isNumeric) {
        searchConditions.push({ numBat: Number(qTrimmed) });
      }
      
      // Recherche par Adresse
      searchConditions.push({ adresse: { [Op.like]: `%${qTrimmed}%` } });
      
      // Recherche par Montant (si c'est un nombre qui pourrait être un montant)
      if (isNumeric) {
        const num = Number(qTrimmed);
        // Si c'est un nombre qui pourrait être un montant (entre 1000 et 10000000)
        if (num >= 1000 && num <= 10000000) {
          searchConditions.push({ montant: num });
        }
      }
      
      where[Op.or] = searchConditions;
    }

    // Si le paramètre "available" est présent, filtrer les bâtiments déjà utilisés par d'autres clients
    if (available === 'true' || available === true) {
      try {
        // Récupérer tous les numBat qui ont déjà une convention (peu importe le statut)
        // On vérifie TOUTES les conventions existantes dans la base de données
        const conventions = await Convention.findAll({
          attributes: ['numBat'],
          raw: true
        });
        
        console.log(`🔍 Recherche de bâtiments disponibles: ${conventions.length} convention(s) trouvée(s)`);
        
        // Extraire les numBat uniques qui ont déjà des conventions
        // Filtrer les valeurs null/undefined au cas où
        const excludedBatIds = [...new Set(conventions
          .map(c => c.numBat)
          .filter(numBat => numBat != null && numBat !== undefined)
        )];
        
        console.log(`🚫 Bâtiments exclus (déjà utilisés): ${excludedBatIds.length} - [${excludedBatIds.join(', ')}]`);
        
        // Exclure ces bâtiments de la recherche
        if (excludedBatIds.length > 0) {
          // Créer la condition d'exclusion
          const exclusionCondition = { numBat: { [Op.notIn]: excludedBatIds } };
          
          // Si where contient déjà des conditions, les combiner avec Op.and
          if (Object.keys(where).length > 0) {
            // Créer un nouveau where avec Op.and pour combiner toutes les conditions
            const existingConditions = [];
            
            // Ajouter les conditions existantes (statut, Op.or, etc.)
            Object.keys(where).forEach(key => {
              if (key === Op.and) {
                existingConditions.push(...where[Op.and]);
              } else if (key === Op.or) {
                existingConditions.push({ [Op.or]: where[Op.or] });
              } else {
                existingConditions.push({ [key]: where[key] });
              }
            });
            
            // Ajouter la condition d'exclusion
            existingConditions.push(exclusionCondition);
            
            // Réinitialiser where avec Op.and
            Object.keys(where).forEach(key => delete where[key]);
            where[Op.and] = existingConditions;
          } else {
            // Pas de conditions existantes, ajouter simplement l'exclusion
            where.numBat = exclusionCondition.numBat;
          }
        } else {
          console.log('✅ Aucun bâtiment exclu - tous les bâtiments sont disponibles');
        }
      } catch (error) {
        console.error('❌ Erreur lors de la vérification des bâtiments utilisés:', error);
        // En cas d'erreur, ne pas filtrer pour éviter de bloquer la requête
      }
    }

    const { count, rows } = await MbatimentModel.findAndCountAll({
      where,
      limit,
      offset,
      order: [['numBat', 'DESC']]
    });
    
    // Convertir les images BLOB en base64 pour l'envoi
    const batimentsWithImages = rows.map(b => {
      const batiment = b.toJSON();
      if (batiment.image) {
        batiment.image = batiment.image.toString('base64');
      }
      return batiment;
    });

    res.status(200).json({
      message: "Bâtiments récupérés avec succès",
      status: 200,
      data: batimentsWithImages,
      pagination: {
        page,
        limit,
        total: count,
        pages: Math.ceil(count / limit)
      }
    });
  } catch (error) {
    console.error('Erreur lors de la récupération des bâtiments:', error);
    res.status(500).json({
      message: "Erreur lors de la récupération des bâtiments",
      status: 500,
      error: error.message
    });
  }
});

// READ - Obtenir un bâtiment par ID
router.get("/:numBat", async (req, res) => {
  try {
    const { numBat } = req.params;
    const batiment = await MbatimentModel.findByPk(numBat);

    if (!batiment) {
      return res.status(404).json({
        message: "Bâtiment non trouvé",
        status: 404
      });
    }

    const batimentData = batiment.toJSON();
    if (batimentData.image) {
      batimentData.image = batimentData.image.toString('base64');
    }

    res.status(200).json({
      message: "Bâtiment récupéré avec succès",
      status: 200,
      data: batimentData
    });
  } catch (error) {
    console.error('Erreur lors de la récupération du bâtiment:', error);
    res.status(500).json({
      message: "Erreur lors de la récupération du bâtiment",
      status: 500,
      error: error.message
    });
  }
});

// CREATE - Créer un nouveau bâtiment
router.post("/", upload.single('image'), validateBatiment, async (req, res) => {
  try {
    const { numBat, adresse, montant, statut } = req.body;

    // Validation des champs
    if (!numBat || !adresse || !montant) {
      return res.status(400).json({
        message: "Veuillez remplir tous les champs obligatoires (numBat, adresse, montant)",
        status: 400
      });
    }

    if (!req.file) {
      return res.status(400).json({
        message: "Veuillez fournir une image",
        status: 400
      });
    }

    // Vérifier si le bâtiment existe déjà
    const existingBatiment = await MbatimentModel.findByPk(numBat);
    if (existingBatiment) {
      return res.status(409).json({
        message: "Un bâtiment avec ce numéro existe déjà",
        status: 409
      });
    }

    // Créer le bâtiment avec l'image en BLOB
    const newBatiment = await MbatimentModel.create({
      numBat: parseInt(numBat),
      image: req.file.buffer,
      adresse: adresse.substring(0, 20), // Limiter à 20 caractères
      montant: parseFloat(montant),
      statut: statut !== undefined ? (statut === 'true' || statut === true || statut === 1) : true
    });

    const batimentData = newBatiment.toJSON();
    if (batimentData.image) {
      batimentData.image = batimentData.image.toString('base64');
    }

    res.status(201).json({
      message: "Bâtiment créé avec succès",
      status: 201,
      data: batimentData
    });
  } catch (error) {
    console.error('Erreur lors de la création du bâtiment:', error);
    res.status(500).json({
      message: "Erreur lors de la création du bâtiment",
      status: 500,
      error: error.message
    });
  }
});

// UPDATE - Mettre à jour un bâtiment
router.put("/:numBat", upload.single('image'), async (req, res) => {
  try {
    const { numBat } = req.params;
    const { adresse, montant, statut } = req.body;

    // Trouver le bâtiment
    const batiment = await MbatimentModel.findByPk(numBat);
    if (!batiment) {
      return res.status(404).json({
        message: "Bâtiment non trouvé",
        status: 404
      });
    }

    // Préparer les données de mise à jour
    const updateData = {};
    if (adresse) updateData.adresse = adresse.substring(0, 20);
    if (montant !== undefined) updateData.montant = parseFloat(montant);
    if (statut !== undefined) {
      updateData.statut = (statut === 'true' || statut === true || statut === 1);
    }
    if (req.file) {
      updateData.image = req.file.buffer;
    }

    // Mettre à jour le bâtiment
    await batiment.update(updateData);

    // Récupérer le bâtiment mis à jour
    const updatedBatiment = await MbatimentModel.findByPk(numBat);
    const batimentData = updatedBatiment.toJSON();
    if (batimentData.image) {
      batimentData.image = batimentData.image.toString('base64');
    }

    res.status(200).json({
      message: "Bâtiment mis à jour avec succès",
      status: 200,
      data: batimentData
    });
  } catch (error) {
    console.error('Erreur lors de la mise à jour du bâtiment:', error);
    res.status(500).json({
      message: "Erreur lors de la mise à jour du bâtiment",
      status: 500,
      error: error.message
    });
  }
});

// GET - Endpoint de diagnostic pour vérifier les bâtiments utilisés
router.get("/diagnostic/usage", async (req, res) => {
  try {
    // Récupérer tous les bâtiments
    const allBatiments = await MbatimentModel.findAll({
      attributes: ['numBat', 'adresse', 'montant', 'statut'],
      order: [['numBat', 'ASC']],
      raw: true
    });

    // Récupérer toutes les conventions avec les numBat utilisés
    const conventions = await Convention.findAll({
      attributes: ['numConv', 'numBat', 'codeCli', 'statutConv', 'dateConv'],
      raw: true
    });

    console.log(`📊 Diagnostic: ${allBatiments.length} bâtiment(s) total, ${conventions.length} convention(s) trouvée(s)`);

    // Créer des maps pour faciliter l'accès
    const batimentsMap = new Map();
    allBatiments.forEach(b => {
      batimentsMap.set(b.numBat, {
        numBat: b.numBat,
        adresse: b.adresse,
        montant: b.montant,
        statut: b.statut,
        utilisations: []
      });
    });

    // Associer les conventions aux bâtiments
    conventions.forEach(conv => {
      const batData = batimentsMap.get(conv.numBat);
      if (batData) {
        batData.utilisations.push({
          numConv: conv.numConv,
          codeCli: conv.codeCli,
          statutConv: conv.statutConv,
          dateConv: conv.dateConv
        });
      }
    });

    // Séparer les bâtiments utilisés et disponibles
    const batimentsUtilises = [];
    const batimentsDisponibles = [];

    batimentsMap.forEach((bat, numBat) => {
      if (bat.utilisations.length > 0) {
        batimentsUtilises.push(bat);
      } else {
        batimentsDisponibles.push({
          numBat: bat.numBat,
          adresse: bat.adresse,
          montant: bat.montant,
          statut: bat.statut
        });
      }
    });

    // Extraire la liste des numBat exclus
    const listeBatimentsExclus = batimentsUtilises.map(b => b.numBat).sort((a, b) => a - b);

    // Statistiques
    const stats = {
      total: allBatiments.length,
      utilises: batimentsUtilises.length,
      disponibles: batimentsDisponibles.length,
      tauxUtilisation: allBatiments.length > 0 
        ? ((batimentsUtilises.length / allBatiments.length) * 100).toFixed(2) + '%'
        : '0%'
    };

    console.log(`✅ Diagnostic terminé: ${stats.utilises} utilisé(s), ${stats.disponibles} disponible(s)`);
    console.log(`🚫 Bâtiments exclus: [${listeBatimentsExclus.join(', ')}]`);

    res.status(200).json({
      message: "Diagnostic des bâtiments récupéré avec succès",
      status: 200,
      stats,
      batimentsUtilises: batimentsUtilises.sort((a, b) => a.numBat - b.numBat),
      batimentsDisponibles: batimentsDisponibles.sort((a, b) => a.numBat - b.numBat),
      listeBatimentsExclus
    });
  } catch (error) {
    console.error('❌ Erreur lors du diagnostic des bâtiments:', error);
    res.status(500).json({
      message: "Erreur lors du diagnostic des bâtiments",
      status: 500,
      error: error.message
    });
  }
});

// DELETE - Supprimer un bâtiment
router.delete("/:numBat", async (req, res) => {
  try {
    const { numBat } = req.params;

    const batiment = await MbatimentModel.findByPk(numBat);
    if (!batiment) {
      return res.status(404).json({
        message: "Bâtiment non trouvé",
        status: 404
      });
    }

    await batiment.destroy();

    res.status(200).json({
      message: "Bâtiment supprimé avec succès",
      status: 200
    });
  } catch (error) {
    console.error('Erreur lors de la suppression du bâtiment:', error);
    res.status(500).json({
      message: "Erreur lors de la suppression du bâtiment",
      status: 500,
      error: error.message
    });
  }
});

module.exports = router;


