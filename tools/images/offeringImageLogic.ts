// Pseudocode: 
// async function shouldGenerateImageForOffering(offeringId) {
//     // 1. Hat Offering bereits explizite Bilder?
//     const explicitImages = await loadOfferingImages(offeringId, { is_explicit: true });
//     if (explicitImages.length > 0) {
//       return false; // KEINE Generierung, explizite Bilder haben Vorrang
//     }
    
//     // 2. Gibt es bereits ein kanonisches Bild mit diesem Fingerprint?
//     const fingerprint = calculateFingerprintFromOffering(offeringId);
//     const canonicalImage = await findCanonicalImageByFingerprint(fingerprint);
    
//     if (canonicalImage) {
//       // Verwende existierendes kanonisches Bild (via Junction)
//       await insertOfferingImage({
//         offering_id: offeringId,
//         image_id: canonicalImage.image_id,
//         is_explicit: false
//       });
//       return false; // Keine neue Generierung nötig
//     }
    
//     // 3. Kein kanonisches Bild vorhanden → Generiere neues
//     return true; // Generierung nötig
//   }