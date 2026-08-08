import { listThemes } from "./themes";
import { HttpError } from "./http.error";

export const getAllThemes = async () => {
  const result = await listThemes();
  return result.caseOf({
    Right: themes => themes,
    Left: error => {
      throw new HttpError(500, error.message);
    },
  });
};
