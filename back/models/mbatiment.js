const Sequelize = require('sequelize');
module.exports = function(sequelize, DataTypes) {
  return sequelize.define('mbatiment', {
    numBat: {
      autoIncrement: false,
      type: DataTypes.INTEGER,
      allowNull: false,
      primaryKey: true
    },
    image: {
      type: DataTypes.BLOB('long'),
      allowNull: false
    },
    adresse: {
      type: DataTypes.STRING(20),
      allowNull: false
    },
    ville: {
      type: DataTypes.STRING(60),
      allowNull: true
    },
    quartier: {
      type: DataTypes.STRING(60),
      allowNull: true
    },
    latitude: {
      type: DataTypes.DOUBLE,
      allowNull: true
    },
    longitude: {
      type: DataTypes.DOUBLE,
      allowNull: true
    },
    montant: {
      type: DataTypes.DOUBLE,
      allowNull: false
    },
    statut: {
      type: DataTypes.BOOLEAN,
      allowNull: false
    },
    motifInactivite: {
      type: DataTypes.TEXT,
      allowNull: true
    }
  }, {
    sequelize,
    tableName: 'mbatiment',
    timestamps: false,
    indexes: [
      {
        name: "PRIMARY",
        unique: true,
        using: "BTREE",
        fields: [
          { name: "numBat" },
        ]
      },
    ]
  });
};
