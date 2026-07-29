/**
 * Standart rang palitralari va shriftlar markazi.
 * Docker ichidagi LibreOffice bilan muammosiz ishlashi uchun Arial va Helvetica kabi 
 * standart shriftlar ishlatiladi.
 */

export const FONTS = {
    TITLE: "Arial",
    BODY: "Arial"
  };
  
  export const THEMES = {
    modern_blue: {
      bg: "FFFFFF",        // Oq fon
      primary: "0F52BA",   // Quyuq ko'k
      secondary: "F5F7FA", // Och kulrang-ko'k karta foni
      text: "1A1A1A",      // Qora matn
      accent: "FF6B35"     // To'q sariq (ajratib ko'rsatish uchun)
    },
    dark_tech: {
      bg: "121212",        // Qora fon
      primary: "00E5FF",   // Kiber-ko'k
      secondary: "1E1E1E", // Quyuq kulrang karta foni
      text: "F8F9FA",      // Oq matn
      accent: "FF007A"     // Pushti-qizil
    },
    nature_green: {
      bg: "F9FAEB",
      primary: "2D6A4F",
      secondary: "E9ECEF",
      text: "1B4332",
      accent: "DDA15E"
    },
    elegant_red: {
      bg: "FFFFFF",
      primary: "9E0059",
      secondary: "F8EDEB",
      text: "2B2D42",
      accent: "FF0054"
    },
    minimal_light: {
      bg: "FAFAFA",
      primary: "2B2D42",
      secondary: "FFFFFF",
      text: "333333",
      accent: "8D99AE"
    }
  };
  
  /**
   * Berilgan mavzu nomiga qarab rang obyektini qaytaradi.
   * Agar topilmasa, standart holatda 'modern_blue' ni beradi.
   */
  export const getThemeColors = (themeName) => {
    return THEMES[themeName] || THEMES.modern_blue;
  };