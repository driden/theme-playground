import { listThemes } from "@playground/lib/themes";
import { HttpError } from "./http.error";

export const getAllThemes = async () => {
  const result = await listThemes();
  return result.match(
    themes => themes,
    error => {
      throw new HttpError(500, error.message);
    },
  );
};
