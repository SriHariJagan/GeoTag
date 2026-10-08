import { Link } from "react-router-dom";
import styles from "./Unauthorized.module.css";

const Unauthorized = () => {
  return (
    <div className={styles.wrapper}>
      <div className={styles.card}>
        <h1 className={styles.code}>403</h1>
        <h2 className={styles.title}>Access Denied</h2>

        <p className={styles.message}>
          You don’t have permission to view this page.
          Please contact your administrator if you believe this is a mistake.
        </p>

        <Link to="/" className={styles.button}>
          Go to Dashboard
        </Link>
      </div>
    </div>
  );
};

export default Unauthorized;
