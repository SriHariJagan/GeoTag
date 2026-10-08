import { Link } from "react-router-dom";
import styles from "./NotFound.module.css";

const NotFound = () => {
  return (
    <div className={styles.wrapper}>
      <div className={styles.card}>
        <h1 className={styles.code}>404</h1>
        <h2 className={styles.title}>Page Not Found</h2>

        <p className={styles.message}>
          The page you’re looking for doesn’t exist or was moved.
        </p>

        <Link to="/" className={styles.button}>
          Back to Dashboard
        </Link>
      </div>
    </div>
  );
};

export default NotFound;
